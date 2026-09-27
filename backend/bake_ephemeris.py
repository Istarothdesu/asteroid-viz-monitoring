"""行星/月球星历烘焙: SPICE (de440s/de430) -> planet_ephemeris 表 (数据工厂步骤)。

为什么需要它: 前端此前用 JPL 简化长期根数表推算行星位置 (约 1800-2050 有效档),
地球位置误差可达数千~数万公里, 而接近事件的距离/时刻 = 小行星位置 - 地球位置,
精度上限被地球位置锁死。烘焙后前端改用"采样点 + Hermite 插值", 误差降至公里级。

时标口径: 采样网格是 **TDB 均匀时标**，与 J2000 刚性对齐 86400s/天，
不做 utc2et 的闰秒历法转换。若误把网格当民用 UTC 并跨越闰秒，Hermite 的
h·v 项按 86400s 缩放, 端点导数失配会引入 轨道速度×1s 的插值误差 (实测地球
27 km / 海王星 5.4 km, 2026-09 校验管线实测抓获)。JPL CAD/SBDB 的事件与
轨道历元同样按 TDB JD 进入计算；民用 UTC 只用于界面时钟和用户输入输出。

用法 (仅外网出包机需要, 运行时/内网部署只消费生成的表):
    uv sync --extra bake
    uv run python download_kernels.py     # 一次性下载 SPICE 内核
    uv run python bake_ephemeris.py       # 烘焙并写库

也可经同步接口触发: POST /api/sync/ephem (与 named/cad/mpcorb 同构)。
坐标系 ECLIPJ2000, 几何位置 (无光行差修正), 与开普勒传播语义对齐。
"""

import asyncio
import logging
import math
import sys
from array import array
from pathlib import Path

from sqlalchemy import delete

from db import PlanetEphemeris, SessionLocal

log = logging.getLogger(__name__)

KERNELS_DIR = Path(__file__).resolve().parent / "kernels"
# 星历内核: de440s (首选) 或 de430 (镜像备选), 取磁盘上存在的那个
SPK = next(
    (KERNELS_DIR / n for n in ("de440s.bsp", "de430.bsp") if (KERNELS_DIR / n).is_file()),
    KERNELS_DIR / "de440s.bsp",  # 都不存在时用默认名, 让缺失报错信息指向它
)

AU_KM = 149597870.7
SEC_PER_DAY = 86400.0
JD_J2000 = 2451545.0

# 覆盖范围与前端 JD_MIN/JD_MAX 一致 (constants.ts), 含 1908 通古斯等历史复盘
JD0 = 2415020.5  # TDB JD 数值网格起点
JD1 = 2488069.5  # TDB JD 数值网格终点

# 采样步长按轨道快慢分档: Hermite 三次插值误差 ~ (ωh)^4, 各档位误差均 < 2 km
# (name, SPICE target, SPICE center, step_d)
# 注意: de430.bsp 只含水/金/地/月的行星中心 (199/299/399/301), 火星及以外
# 只有系统质心 (4-8)。质心与行星中心之差: 火星 ~米级 (卫星质量比 1e-8),
# 木星/土星 ~百公里级 (卫星拖移), 对系统级态势显示与近地接近分析无影响;
# 若未来需要外行星精确中心, 需叠加对应卫星系统内核 (mar097/jupxxx/satxxx)。
BODIES: list[tuple[str, str, str, float]] = [
    ("mercury", "199", "10", 0.5),
    ("venus", "299", "10", 1.0),
    ("earth", "399", "10", 1.0),
    ("mars", "4", "10", 2.0),
    ("jupiter", "5", "10", 4.0),
    ("saturn", "6", "10", 4.0),
    ("uranus", "7", "10", 4.0),
    ("neptune", "8", "10", 4.0),
    ("moon", "301", "399", 0.25),  # 地心相对坐标
]


def _jd_to_et(jd: float) -> float:
    """仿真 JD (均匀时标) -> SPICE ET (J2000 起 TDB 秒), 刚性 86400 s/天。
    见模块 docstring 的时标口径说明。"""
    return (jd - JD_J2000) * SEC_PER_DAY


def _bake_body(spice, name: str, target: str, center: str, step: float) -> PlanetEphemeris:
    count = math.ceil((JD1 - JD0) / step) + 1
    pos = array("d")  # float64, AU
    vel = array("f")  # float32, AU/day
    for k in range(count):
        state, _ = spice.spkezr(target, _jd_to_et(JD0 + k * step),
                                "ECLIPJ2000", "NONE", center)
        pos.extend((state[0] / AU_KM, state[1] / AU_KM, state[2] / AU_KM))
        vel.extend((
            state[3] * SEC_PER_DAY / AU_KM,
            state[4] * SEC_PER_DAY / AU_KM,
            state[5] * SEC_PER_DAY / AU_KM,
        ))
    if sys.byteorder == "big":  # 线格式固定小端
        pos.byteswap()
        vel.byteswap()
    return PlanetEphemeris(
        body=name, jd0=JD0, step_d=step, count=count,
        pos=pos.tobytes(), vel=vel.tobytes(),
    )


async def bake() -> tuple[int, str]:
    """烘焙全部天体并整表替换; 返回 (总采样点数, 说明)。"""
    if not SPK.is_file():
        raise RuntimeError(
            f"缺少 SPICE 星历内核 ({KERNELS_DIR}), 请先运行: uv run python download_kernels.py"
        )
    import spiceypy as spice  # 延迟导入: 运行时镜像不安装 bake 依赖

    spice.furnsh(str(SPK))
    try:
        rows = [_bake_body(spice, *spec) for spec in BODIES]
    finally:
        spice.kclear()

    async with SessionLocal() as session:
        await session.execute(delete(PlanetEphemeris))
        session.add_all(rows)
        await session.commit()
    total = sum(r.count for r in rows)
    size_mb = sum(len(r.pos) + len(r.vel) for r in rows) / 1e6
    return total, f"{len(rows)} 天体, {JD0}-{JD1}, {size_mb:.1f} MB"


def main() -> int:
    from sync import run_sync  # 复用串行守卫与 SyncStatus 记录

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    return 0 if asyncio.run(run_sync("ephem")) else 1


if __name__ == "__main__":
    sys.exit(main())
