"""重点小行星星历烘焙: JPL Horizons -> asteroid_ephemeris 表 (数据工厂步骤)。

动机: 开普勒二体传播随 |t - 历元| 发散 (Ceres 实测离历元 4 年偏差 240 万 km),
而观测预报与事件复盘 (核心功能) 需要全摄动精度。做法与行星星历同构
(bake_ephemeris.py): 离线从 Horizons 拉取逐日状态向量烘焙成表,
前端 Hermite 插值消费; 运行时/内网零积分、零外网依赖。

目标集: asteroids 表中 pha=1 或属于 NAMED 命名清单的天体 (~80 颗);
其余天体 (by-des 缓存、云带样本) 仍走开普勒兜底。窗口 1980-2060:
覆盖全部 CAD 事件与观测预报场景; 更早的历史复盘 (1908 通古斯等)
由内置事件的固定根数承担, 不在此表。

步长: NEO 1 天, 其他 2 天 (Hermite 误差 ~ (ωh)^4, 参照行星表
地球 1d→89m / 水星 0.5d→1229m 的实测档位, 两档均远优于 2km 阈值)。

时标口径与 bake_ephemeris.py 一致: 网格使用 TDB JD 均匀时标 (86400s/天)，
Horizons VECTORS 的小天体历元也按 TDB 请求和解析；
精度验证见 validate.py 校验项 5 (离网格点对拍 Horizons)。

用法 (仅外网出包机需要, 运行时镜像只消费生成的表):
    uv run python bake_asteroid_ephemeris.py
也可经同步接口触发: POST /api/sync/ephem_ast (需 SYNC_ENABLED=true)。
"""

import asyncio
import logging
import re
import sys
from array import array

import httpx
from sqlalchemy import delete, select

from db import Asteroid, AsteroidEphemeris, SessionLocal
from named_asteroids import NAMED

log = logging.getLogger(__name__)

HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
# 分段向量响应可达数 MB, read 放宽; 不引用 sync.TIMEOUT_DEFAULT 以避免循环导入
TIMEOUT = httpx.Timeout(connect=30.0, read=120.0, write=30.0, pool=30.0)

# 覆盖窗口 (TDB JD 数值): 1980-01-01 .. 2060-01-01
JD0 = 2444239.5
JD1 = 2473459.5

# Horizons API 单次响应行数有限, 按 4000 天分段请求
CHUNK_D = 4000

# 小天体响应头部带"解算历元等效直角坐标"干扰行, 必须只在 $$SOE 块内解析
_RE_XYZ = re.compile(
    r"X\s*=\s*([-+0-9.E]+)\s*Y\s*=\s*([-+0-9.E]+)\s*Z\s*=\s*([-+0-9.E]+)")
_RE_V = re.compile(
    r"VX\s*=\s*([-+0-9.E]+)\s*VY\s*=\s*([-+0-9.E]+)\s*VZ\s*=\s*([-+0-9.E]+)")


def parse_vector_block(text: str) -> list[tuple[list[float], list[float]]]:
    """解析 Horizons VECTORS 响应 $$SOE..$$EOE 块, 返回 [(posAU, velAU/day)]。"""
    i, j = text.find("$$SOE"), text.find("$$EOE")
    if i < 0 or j < 0:
        raise ValueError("响应缺少 $$SOE/$$EOE 块")
    block = text[i:j]
    poss = _RE_XYZ.findall(block)
    vels = _RE_V.findall(block)
    if len(poss) != len(vels):
        raise ValueError(f"位置/速度条数不一致: {len(poss)} vs {len(vels)}")
    return [([float(x) for x in p], [float(x) for x in v])
            for p, v in zip(poss, vels)]


async def _fetch_chunk(client: httpx.AsyncClient, des: str,
                       jd_start: float, jd_stop: float, step: float) -> str:
    for attempt in range(3):
        try:
            r = await client.get(HORIZONS_URL, params={
                "format": "text", "COMMAND": f"'{des};'", "CENTER": "'@10'",
                "EPHEM_TYPE": "'VECTORS'",
                "START_TIME": f"'JD{jd_start}'", "STOP_TIME": f"'JD{jd_stop}'",
                "STEP_SIZE": f"'{step:g}d'",
                "OUT_UNITS": "'AU-D'", "VEC_TABLE": "'2'",
            })
            if r.status_code == 200:
                return r.text
            log.warning("Horizons %s 返回 %d", des, r.status_code)
        except httpx.HTTPError as exc:
            log.warning("Horizons 请求异常(第%d次): %s %s", attempt + 1, des, exc)
        await asyncio.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Horizons 请求失败: {des} [{jd_start}, {jd_stop}]")


async def _bake_body(client: httpx.AsyncClient, des: str,
                     step: float, orbit_solution_id: str | None) -> AsteroidEphemeris:
    """拉取单天体全窗口状态向量并组装为表行。"""
    count = round((JD1 - JD0) / step) + 1
    pos = array("d")  # float64, AU
    vel = array("f")  # float32, AU/day
    jd = JD0
    while jd < JD1:
        jd_stop = min(jd + CHUNK_D, JD1)
        entries = parse_vector_block(await _fetch_chunk(client, des, jd, jd_stop, step))
        expect = round((jd_stop - jd) / step) + 1
        if len(entries) != expect:
            raise RuntimeError(
                f"{des} 段 [{jd}, {jd_stop}] 点数 {len(entries)} != 预期 {expect}")
        for p, v in entries:
            pos.extend(p)
            vel.extend(v)
        jd = jd_stop + step  # 端点不重复
        await asyncio.sleep(0.2)  # 对 JPL 接口保持温和
    if len(pos) != count * 3:
        raise RuntimeError(f"{des} 总点数 {len(pos) // 3} != 预期 {count}")
    if sys.byteorder == "big":  # 线格式固定小端
        pos.byteswap()
        vel.byteswap()
    return AsteroidEphemeris(
        designation=des, orbit_solution_id=orbit_solution_id,
        jd0=JD0, step_d=step, count=count,
        pos=pos.tobytes(), vel=vel.tobytes(),
    )


async def bake_asteroids() -> tuple[int, str]:
    """烘焙目标集并逐天体整行替换; 返回 (成功天体数, 说明)。"""
    async with SessionLocal() as session:
        rows = (await session.execute(select(Asteroid))).scalars().all()
    targets = [(r.designation, 1.0 if r.neo else 2.0, r.orbit_solution_id)
               for r in rows if r.pha or r.designation in NAMED]
    if not targets:
        raise RuntimeError("asteroids 表为空或无 PHA/NAMED 天体, 请先同步根数")
    log.info("待烘焙 %d 个重点小行星, 窗口 JD %.1f-%.1f", len(targets), JD0, JD1)

    # 断点续跑: 已是当前窗口/步长的行跳过 (重跑常见于超时或部分失败后)
    async with SessionLocal() as session:
        existing = {r.designation: r for r in (await session.execute(
            select(AsteroidEphemeris))).scalars().all()}
    todo = []
    for des, step, orbit_solution_id in targets:
        old = existing.get(des)
        expect = round((JD1 - JD0) / step) + 1
        if (old and old.jd0 == JD0 and old.step_d == step and old.count == expect
                and old.orbit_solution_id == orbit_solution_id):
            continue
        todo.append((des, step, orbit_solution_id))
    log.info("已完成 %d 个, 本次续烘 %d 个", len(targets) - len(todo), len(todo))

    ok, failed = 0, []
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        for n, (des, step, orbit_solution_id) in enumerate(todo, 1):
            try:
                row = await _bake_body(client, des, step, orbit_solution_id)
            except Exception as exc:  # noqa: BLE001 — 单天体失败不中断全批
                log.exception("烘焙失败: %s", des)
                failed.append(des)
                continue
            async with SessionLocal() as session:
                await session.execute(
                    delete(AsteroidEphemeris).where(
                        AsteroidEphemeris.designation == des))
                session.add(row)
                await session.commit()
            ok += 1
            if n % 10 == 0:
                log.info("烘焙进度 %d/%d (成功 %d, 失败 %d)",
                         n, len(todo), ok, len(failed))
    msg = f"{len(targets)} 目标, 本次烘焙 {ok}, 失败 {len(failed)}"
    if failed:
        msg += f": {', '.join(failed[:10])}"
        raise RuntimeError(msg)  # 有失败则任务置 error, 阻止带病出包
    return ok, msg


def main() -> int:
    from sync import run_sync  # 复用串行守卫与 SyncStatus 记录

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    return 0 if asyncio.run(run_sync("ephem_ast")) else 1


if __name__ == "__main__":
    sys.exit(main())
