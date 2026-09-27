"""精度校验管线 (P1-1): 数据工厂每次出包前运行, 产出 validation_report.md。

把"轨道真实性"从口头承诺变成可审计数字。校验项:

1. 星历插值精度 (需要 SPICE 内核): planet_ephemeris 表的 Hermite 插值结果
   vs SPICE 直接解算 (真值), 逐天体随机采样, 报告最大误差; 阈值 FAIL > 5 km。
2. 开普勒传播链不变量: 对库内全部命名小行星 + 云带抽样, 验证比轨道能量
   ε = v²/2 − μ/r ≡ −μ/(2a) (二体问题的运动常数)。该项检验的是"数据 +
   传播实现"的自洽性, 容差 1e-9 (双精度舍入量级)。
3. 数据新鲜度: 根数历元分布。开普勒外推误差随 |t − 历元| 增长,
   历元距今越久, 远期推演可信度越低 —— 这是分析场景的重要元信息。
4. (可选) Horizons 交叉验证: ssd.jpl.nasa.gov 可达时, 抽样对比地球与
   一颗库内小行星的位置。不可达自动跳过 (内网/受限网络预期行为)。
5. 小行星星历插值: asteroid_ephemeris 表 (bake_asteroid_ephemeris.py 烘焙)
   的 Hermite 插值 vs Horizons 离网格点, 阈值与校验项 1 相同 (2 km);
   表为空或 Horizons 不可达时跳过。
6. N 体积分推演 (nbody.py, 事件推演链路): 从烘焙星历网格点取初值,
   前后各积 2 年, 端点与烘焙星历对拍 (离线, 阈值 2000 km)。
7. CAD 风险链路: 校验 CAD 轨道解编号与本地根数一致，并用最近一条近遇
   实跑 B 平面/N 体链路，对比 CAD 官方最近距离，防止版本串用或量级漂移。

用法:
    uv sync --extra bake   # 校验项 1 需要 spiceypy 与内核
    uv run python validate.py
退出码: 全部 PASS/SKIP = 0, 任一 FAIL = 1 (供 CI/出包门禁使用)。
"""

import asyncio
import logging
import math
import random
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
from sqlalchemy import select

from db import (
    Asteroid, AsteroidEphemeris, CloseApproach, CloudOrbit,
    PlanetEphemeris, RiskAssessment, SessionLocal,
)

log = logging.getLogger(__name__)

KERNELS_DIR = Path(__file__).resolve().parent / "kernels"
REPORT_PATH = Path(__file__).resolve().parent / "validation_report.md"

AU_KM = 149597870.7
KGAUSS = 0.01720209895  # AU^1.5/day (高斯引力常数, 与前端 constants.ts 一致)
MU = KGAUSS * KGAUSS    # AU^3/day^2
JD_J2000 = 2451545.0

EPHEM_FAIL_KM = 2.0       # 星历插值最大误差阈值 (实测最差为水星 ~1.3 km)
INVARIANT_TOL = 1e-9      # 能量不变量相对容差
HORIZONS_TIMEOUT = httpx.Timeout(15.0)

# SPICE target/center 与 bake_ephemeris.py 的 BODIES 对齐
SPICE_ID = {
    "mercury": ("199", "10"), "venus": ("299", "10"), "earth": ("399", "10"),
    "mars": ("4", "10"), "jupiter": ("5", "10"), "saturn": ("6", "10"),
    "uranus": ("7", "10"), "neptune": ("8", "10"), "moon": ("301", "399"),
}


class Check:
    def __init__(self, name: str):
        self.name = name
        self.status = "PASS"
        self.lines: list[str] = []

    def add(self, line: str) -> None:
        self.lines.append(line)

    def fail(self, line: str) -> None:
        self.status = "FAIL"
        self.lines.append(f"**FAIL**: {line}")

    def skip(self, reason: str) -> None:
        self.status = "SKIP"
        self.lines.append(f"跳过: {reason}")


# ---------------------------------------------------------------- 星历插值

from nbody import hermite as _hermite, kepler_state as _kepler_state  # noqa: E402


def check_ephemeris(rows: list[PlanetEphemeris], n_samples: int = 300) -> Check:
    ck = Check("1. 星历 Hermite 插值精度 (vs SPICE 真值)")
    if not rows:
        ck.skip("planet_ephemeris 表为空 (未烘焙)")
        return ck
    spk = next(
        (KERNELS_DIR / n for n in ("de440s.bsp", "de430.bsp")
         if (KERNELS_DIR / n).is_file()),
        None,
    )
    if spk is None:
        ck.skip("SPICE 星历内核不存在 (运行时/内网环境无需此校验)")
        return ck
    import spiceypy as spice

    spice.furnsh(str(spk))
    rng = random.Random(42)
    try:
        ck.add("| 天体 | 采样点 | 最大误差 | RMS 误差 |")
        ck.add("| --- | ---: | ---: | ---: |")
        for row in rows:
            tgt, ctr = SPICE_ID[row.body]
            errs = []
            for _ in range(n_samples):
                jd = row.jd0 + rng.random() * (row.count - 1) * row.step_d
                p = _hermite(row, jd)
                # 与烘焙同一均匀时标口径 (见 bake_ephemeris.py docstring)
                et = (jd - JD_J2000) * 86400.0
                s, _ = spice.spkezr(tgt, et, "ECLIPJ2000", "NONE", ctr)
                errs.append(math.dist(p, [v / AU_KM for v in s[:3]]) * AU_KM)
            mx = max(errs)
            rms = math.sqrt(sum(e * e for e in errs) / len(errs))
            ck.add(f"| {row.body} | {n_samples} | {mx * 1000:.0f} m | {rms * 1000:.0f} m |")
            if mx > EPHEM_FAIL_KM:
                ck.fail(f"{row.body} 插值最大误差 {mx:.2f} km 超过阈值 {EPHEM_FAIL_KM} km")
    finally:
        spice.kclear()
    return ck


# ---------------------------------------------------------------- 开普勒不变量

def check_kepler_invariant(asts: list[Asteroid], clouds: list[CloudOrbit]) -> Check:
    ck = Check("2. 开普勒传播链能量不变量 (ε = v²/2 − μ/r ≡ −μ/2a)")
    samples = [(r.a, r.e, r.i, r.om, r.w, r.m0, f"sbdb:{r.designation}") for r in asts]
    rng = random.Random(7)
    samples += [
        (r.a, r.e, r.i, r.om, r.w, r.m0, f"cloud:{r.designation or r.id}")
        for r in rng.sample(clouds, min(200, len(clouds)))
    ]
    jd_now = datetime.now(timezone.utc).timestamp() / 86400 + 2440587.5
    worst, worst_id = 0.0, ""
    for a, e, i, om, w, m0, tag in samples:
        for jd in (jd_now - 3652.5, jd_now, jd_now + 3652.5):  # ±10 年
            p, v = _kepler_state(a, e, i, om, w, m0, jd)
            r = math.dist((0, 0, 0), p)
            v2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2
            eps = v2 / 2 - MU / r
            expect = -MU / (2 * a)
            rel = abs(eps - expect) / abs(expect)
            if rel > worst:
                worst, worst_id = rel, tag
    ck.add(f"样本 {len(samples)} 个天体 × 3 时刻, 最大相对偏差 {worst:.2e} ({worst_id})")
    if worst > INVARIANT_TOL:
        ck.fail(f"能量不变量相对偏差 {worst:.2e} 超过容差 {INVARIANT_TOL:.0e}")
    return ck


# ---------------------------------------------------------------- 数据新鲜度

def check_freshness(asts: list[Asteroid], clouds: list[CloudOrbit]) -> Check:
    ck = Check("3. 根数历元新鲜度与数据精度")
    jd_now = datetime.now(timezone.utc).timestamp() / 86400 + 2440587.5

    def stats(rows, get, label):
        if not rows:
            ck.add(f"{label}: 无数据")
            return
        ages = sorted((jd_now - get(r)) / 365.25 for r in rows)
        ck.add(
            f"{label}: {len(rows)} 条, 历元年龄 中位 {ages[len(ages) // 2]:.1f} 年, "
            f"最旧 {ages[-1]:.1f} 年, 最新 {ages[0]:.2f} 年"
        )

    stats(asts, lambda r: r.epoch_jd, "命名小行星 (SBDB)")
    stats(clouds, lambda r: r.epoch_jd, "云带抽样 (MPCORB)")
    ck.add("判读: 开普勒外推误差随历元年龄增长, 近地天体历元超过 ~1 年后")
    ck.add("远期推演距离误差可达数千 km 量级 —— 靠定期更新数据包压低。")

    # SBDB 展示级舍入值探针: 未加 full-prec 同步的存量数据, M/a 多为整数或两位小数
    # (M 舍入 1° ≈ 相位误差数百万 km)。全精度数据的 m0 几乎不可能恰为整数。
    rounded = sum(1 for r in asts if abs(r.m0 - round(r.m0)) < 1e-9
                  or abs(r.a * 1000 - round(r.a * 1000)) < 1e-9)
    ck.add(f"疑似舍入值 (m0 整数或 a 仅两位小数): {rounded}/{len(asts)}")
    if asts and rounded / len(asts) > 0.05:
        ck.fail(f"{rounded}/{len(asts)} 条疑似 SBDB 展示级舍入值, "
                "请重新同步 (fetch_sbdb 已加 full-prec)")
    return ck


# ---------------------------------------------------------------- Horizons 交叉验证

_HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
_RE_VEC = re.compile(
    r"X\s*=\s*([-+0-9.E]+)\s*Y\s*=\s*([-+0-9.E]+)\s*Z\s*=\s*([-+0-9.E]+)")


def parse_horizons_vector(text: str) -> tuple[float, float, float] | None:
    """从 Horizons VECTORS 响应文本提取位置向量 (AU)。供校验与单测复用。

    必须限定在 $$SOE..$$EOE 块内: 小天体响应的头部会带一段
    "Equivalent ICRF heliocentric cartesian coordinates" (解算历元处的
    等效坐标, 与请求时刻无关), 全文搜第一个 X= 会抓到它。
    """
    soe = text.find("$$SOE")
    if soe < 0:
        return None
    m = _RE_VEC.search(text, soe)
    if not m:
        return None
    return (float(m.group(1)), float(m.group(2)), float(m.group(3)))


async def check_horizons(eph_rows: list[PlanetEphemeris], asts: list[Asteroid]) -> Check:
    ck = Check("4. JPL Horizons 交叉验证 (可选, 需 ssd.jpl.nasa.gov 可达)")
    earth = next((r for r in eph_rows if r.body == "earth"), None)
    if earth is None or not asts:
        ck.skip("星历或小行星数据为空")
        return ck
    jd = JD_J2000 + 8000.0  # 2022-03-21, 避开端点
    # Horizons VECTORS 与本地烘焙表都使用 TDB JD；该项直接比较同一数值历元。
    try:
        # 每个请求用独立 client: Horizons 会在 cookie 里保留会话状态,
        # 同一会话先发大行体查询 ('399') 再做小天体检索 ('1;') 时,
        # 后者可能被解析到错误目标 (实测偏差 7 亿 km 级)。
        ref = await _horizons_pos("399", "@10", jd)
        if ref is None:
            ck.skip("Horizons 不可达或响应异常 (内网/受限网络预期行为)")
            return ck
        mine = _hermite(earth, jd)
        ck.add(f"地球 @JD{jd}: 本系统 vs Horizons 偏差 "
               f"{math.dist(mine, ref) * AU_KM * 1000:.0f} m")
        # 小行星: 在根数历元时刻对比 —— 历元处开普勒根数按定义等于
        # 全摄动解的瞬时状态, 偏差应接近解算不确定度 (km 级), 可抓数据错误;
        # 远离历元的偏差是摄动累积 (校验项 3 已刻画), 不在此比对。
        a0 = asts[0]
        # 小天体命令加 ';' 取 JPL 最新解 (裸 SPICE ID 可能指向任务重建弧段)
        cmd = f"{a0.designation};"
        ref2 = await _horizons_pos(cmd, "@10", a0.epoch_jd)
        if ref2 is not None:
            p, _ = _kepler_state(a0.a, a0.e, a0.i, a0.om, a0.w, a0.m0,
                                 a0.epoch_jd)
            ck.add(f"{a0.designation} @历元 JD{a0.epoch_jd}: 开普勒 vs Horizons 偏差 "
                   f"{math.dist(p, ref2) * AU_KM:,.0f} km (历元处应≈解算误差)")
    except (httpx.HTTPError, OSError) as exc:
        detail = str(exc).strip() or type(exc).__name__
        ck.skip(f"Horizons 请求失败: {detail}")
    return ck


async def _horizons_pos(command: str, center: str,
                        jd: float) -> tuple[float, float, float] | None:
    async with httpx.AsyncClient(timeout=HORIZONS_TIMEOUT) as client:
        r = await client.get(_HORIZONS_URL, params={
            "format": "text", "COMMAND": f"'{command}'", "CENTER": f"'{center}'",
            "EPHEM_TYPE": "'VECTORS'", "TLIST": str(jd), "OUT_UNITS": "'AU-D'",
            "VEC_TABLE": "'2'",
        })
    if r.status_code != 200:
        return None
    return parse_horizons_vector(r.text)


# ---------------------------------------------------------------- 小行星星历插值

async def check_asteroid_ephemeris(ast_eph: list) -> Check:
    """asteroid_ephemeris 表的 Hermite 插值 vs Horizons 离网格点真值。

    烘焙采样与对比查询都走 Horizons 的 JD 标签口径, 时标语义偏差两侧相消,
    测到的就是纯插值误差; 阈值与行星星历相同 (2 km)。"""
    ck = Check("5. 小行星星历 Hermite 插值 (vs Horizons 离网格点)")
    if not ast_eph:
        ck.skip("asteroid_ephemeris 表为空 (未烘焙, 见 bake_asteroid_ephemeris.py)")
        return ck
    # 覆盖区间必须含"现在" —— 烘焙窗口写错 (不含当前时刻) 时插值会静默
    # 回退开普勒, 离网格点对拍抽不到窗口外, 必须单独把守
    jd_now = datetime.now(timezone.utc).timestamp() / 86400 + 2440587.5
    bad_cov = [r.designation for r in ast_eph
               if not (r.jd0 <= jd_now <= r.jd0 + (r.count - 1) * r.step_d)]
    if bad_cov:
        ck.fail(f"{len(bad_cov)} 颗小行星星历窗口不含当前时刻 "
                f"(JD {jd_now:.1f}), 如 {bad_cov[:5]} —— 检查烘焙窗口配置")
        return ck
    rng = random.Random(11)
    # 等距抽样 5 颗 (覆盖 NEO 1d 与主带 2d 两种步长档)
    stride = max(1, len(ast_eph) // 5)
    sample = ast_eph[::stride][:5]
    ck.add("| 天体 | 步长(d) | 采样点 | 最大误差 |")
    ck.add("| --- | ---: | ---: | ---: |")
    try:
        for row in sample:
            errs = []
            for _ in range(6):
                jd = row.jd0 + rng.random() * (row.count - 1) * row.step_d
                ref = await _horizons_pos(f"{row.designation};", "@10", jd)
                if ref is None:
                    ck.skip("Horizons 不可达或响应异常 (内网/受限网络预期行为)")
                    return ck
                errs.append(math.dist(_hermite(row, jd), ref) * AU_KM)
                await asyncio.sleep(0.2)  # 对 JPL 接口保持温和
            mx = max(errs)
            ck.add(f"| {row.designation} | {row.step_d:g} | {len(errs)} | "
                   f"{mx * 1000:.0f} m |")
            if mx > EPHEM_FAIL_KM:
                ck.fail(f"{row.designation} 插值最大误差 {mx:.2f} km "
                        f"超过阈值 {EPHEM_FAIL_KM} km")
    except (httpx.HTTPError, OSError) as exc:
        detail = str(exc).strip() or type(exc).__name__
        ck.skip(f"Horizons 请求失败: {detail}")
    return ck


# ---------------------------------------------------------------- N 体积分推演

# 力模型缺主带大天体/相对论/非引力项, 2 年弧段实测端点偏差为 km~十 km 级,
# 阈值取 2000 km (抓力模型/初值错误等量级的 bug, 不苛求模型完备性)
NBODY_FAIL_KM = 2000.0


def check_nbody(eph_rows: list[PlanetEphemeris], ast_eph_rows: list) -> Check:
    """N 体积分器 (nbody.py, 事件推演路径) vs 烘焙的 Horizons 全摄动星历。

    纯离线: 从烘焙星历网格点取全摄动初值, 前后各积 2 年, 端点与星历
    Hermite 插值对拍。该项检验"积分器 + 摄动场 + 初值"整条推演链路。"""
    ck = Check("6. N 体积分推演 vs 烘焙星历 (离线)")
    if not ast_eph_rows:
        ck.skip("asteroid_ephemeris 表为空 (未烘焙, bake_asteroid_ephemeris.py)")
        return ck
    if not eph_rows:
        ck.skip("planet_ephemeris 表为空 (未烘焙)")
        return ck
    from nbody import PerturberField, grid_state, integrate

    field = PerturberField(eph_rows)
    by_des = {r.designation: r for r in ast_eph_rows}
    # 代表性样本: 主带 (1 Ceres) / NEO (101955 Bennu) / 高偏心率 (1566 Icarus)
    picked = [by_des[d] for d in ("1", "101955", "1566") if d in by_des]
    if not picked:
        picked = list(ast_eph_rows[:3])
    jd_now = datetime.now(timezone.utc).timestamp() / 86400 + 2440587.5
    ck.add("| 天体 | 弧长 | 端点偏差 |")
    ck.add("| --- | ---: | ---: |")
    worst = 0.0
    for row in picked:
        jd_init, state0 = grid_state(row, jd_now)
        for dt in (-730.0, 730.0):
            jds, states = integrate(state0, jd_init, jd_init + dt, field, abs(dt))
            err = math.dist(states[-1][:3], _hermite(row, jds[-1])) * AU_KM
            worst = max(worst, err)
            ck.add(f"| {row.designation} | {dt:+.0f} d | {err:,.1f} km |")
    if worst > NBODY_FAIL_KM:
        ck.fail(f"N 体积分端点最大偏差 {worst:,.0f} km 超过阈值 {NBODY_FAIL_KM:.0f} km")
    return ck


# ---------------------------------------------------------------- CAD 风险链路

def _cad_orbit_id(row: CloseApproach) -> str | None:
    parts = row.cd_id.split("|", 2)
    return parts[1] if len(parts) == 3 else None


async def check_cad_risk_chain(
    asts: list[Asteroid], cad_rows: list[CloseApproach],
    assessments: list[RiskAssessment],
) -> Check:
    ck = Check("7. CAD 风险链路解析与 B 平面最近距离")
    if not cad_rows:
        ck.skip("close_approaches 表为空")
        return ck
    ast_by_des = {row.designation: row for row in asts}
    assessment_versions = {
        (row.designation, row.orbit_solution_id) for row in assessments
    }
    mismatches = []
    exact_rows = []
    covariance_matches = 0
    for cad in cad_rows:
        orbit_id = _cad_orbit_id(cad)
        asteroid = ast_by_des.get(cad.designation)
        if asteroid is None or orbit_id is None or asteroid.orbit_solution_id != orbit_id:
            mismatches.append(
                f"{cad.designation}(CAD={orbit_id or '?'}, 本地={getattr(asteroid, 'orbit_solution_id', None) or '?'})"
            )
        else:
            exact_rows.append(cad)
        if (cad.designation, orbit_id) in assessment_versions:
            covariance_matches += 1
    ck.add(f"CAD 当前事件 {len(cad_rows)} 条；同版根数 {len(cad_rows) - len(mismatches)}/{len(cad_rows)}；"
           f"同版协方差快照 {covariance_matches}/{len(cad_rows)}")
    if mismatches:
        ck.add(
            f"注意：{len(mismatches)} 条历史事件的 CAD 解与当前快照不同，"
            f"将以最新快照降级重算，不作官方精度对拍。示例 {mismatches[:5]}"
        )
    if not exact_rows:
        ck.add("当前没有同版本 CAD/轨道快照，跳过 B 平面最近距离精度对拍。")
        return ck

    closest = min(exact_rows, key=lambda row: row.dist_ld)
    from risk_service import nominal_bplane
    result = await nominal_bplane(
        closest.designation, closest.jd, _cad_orbit_id(closest),
    )
    if result is None:
        ck.fail(f"{closest.designation} 无法执行名义 B 平面传播")
        return ck
    official_km = closest.dist_ld * 384400.0
    computed_km = result["closestDistanceKm"]
    error_km = abs(computed_km - official_km)
    error_pct = error_km / official_km * 100
    ck.add(
        f"最近事件 {closest.designation}: CAD {official_km:,.0f} km，"
        f"本地 N 体 {computed_km:,.0f} km，偏差 {error_km:,.0f} km ({error_pct:.2f}%)"
    )
    tolerance = max(10_000.0, official_km * 0.10)
    if error_km > tolerance:
        ck.fail(f"最近距离偏差超过门限 {tolerance:,.0f} km")
    return ck


# ---------------------------------------------------------------- 主流程

async def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    async with SessionLocal() as session:
        eph = (await session.execute(
            select(PlanetEphemeris).order_by(PlanetEphemeris.body))).scalars().all()
        ast_eph = (await session.execute(
            select(AsteroidEphemeris).order_by(AsteroidEphemeris.designation))
        ).scalars().all()
        asts = (await session.execute(select(Asteroid))).scalars().all()
        clouds = (await session.execute(select(CloudOrbit))).scalars().all()
        cad_rows = (await session.execute(select(CloseApproach))).scalars().all()
        assessments = (await session.execute(select(RiskAssessment))).scalars().all()

    checks = [
        check_ephemeris(list(eph)),
        check_kepler_invariant(list(asts), list(clouds)),
        check_freshness(list(asts), list(clouds)),
        await check_horizons(list(eph), list(asts)),
        await check_asteroid_ephemeris(list(ast_eph)),
        check_nbody(list(eph), list(ast_eph)),
        await check_cad_risk_chain(
            list(asts), list(cad_rows), list(assessments),
        ),
    ]

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out = [f"# sta-intra 轨道精度校验报告", f"", f"生成时间: {now}", f""]
    failed = False
    for ck in checks:
        out.append(f"## {ck.name} — {ck.status}")
        out.append("")
        out.extend(ck.lines)
        out.append("")
        failed |= ck.status == "FAIL"
    REPORT_PATH.write_text("\n".join(out), encoding="utf-8")
    log.info("报告已写入 %s", REPORT_PATH)
    print("\n".join(out))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
