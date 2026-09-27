"""B 平面概率分析的本地演示数据。

这不是 JPL CAD/Sentry 数据。它构造了一个 2026 年的模拟撞击事件：名义 B
向量落在有效撞击截面内，并给出可见的六根数协方差，供三维热图、密度廊道和
本地概率积分演示。仅由本模块显式执行入库，不参与任何外部数据同步。
"""

import asyncio
import json

from db import Asteroid, RiskAssessment, SessionLocal, SimEvent, utcnow

DEMO_EVENT_ID = "demo-bplane-impact-2026"
DEMO_DESIGNATION = "SIM-BPLANE-2026"
DEMO_ENCOUNTER_ISO = "2026-10-18T12:00:00Z"
DEMO_ENCOUNTER_JD = 2461332.0

# 该组根数由遭遇时刻的日地相对双曲状态反解而来；m0 归一到 J2000。
_ORBIT = {
    "a": 1.7212564905848033,
    "e": 0.42132367309216034,
    "i": 32.82222154595484,
    "om": 24.75945878858079,
    "w": 2.6994926317257693,
    "m0": 47.45402533660829,
    "epoch_jd": DEMO_ENCOUNTER_JD,
    "period_d": 824.834491548844,
}

_COV_LABELS = ["e", "q", "tp", "node", "peri", "i"]
_COV_ELEMENTS = {
    "e": _ORBIT["e"],
    "q": 0.9960503836378924,
    "tp": 2460509.4524157583,
    "node": _ORBIT["om"],
    "peri": _ORBIT["w"],
    "i": _ORBIT["i"],
}
# 对角项对应 e、q(AU)、tp(日)、node/peri/i(度) 的 1σ 方差。这里故意让
# 横向分量也可见：它是二维遭遇密度演示，而不是把协方差伪装成一条细线。
_COVARIANCE = [
    [9e-14, 0, 0, 0, 0, 0],
    [0, 9e-14, 0, 0, 0, 0],
    [0, 0, 1e-6, 0, 0, 0],
    [0, 0, 0, 4e-6, 0, 0],
    [0, 0, 0, 0, 4e-6, 0],
    [0, 0, 0, 0, 0, 4e-6],
]


async def seed_demo_risk_event() -> None:
    """幂等写入演示事件、轨道和协方差快照。"""
    assessment_id = f"{DEMO_DESIGNATION}:DEMO-1:{DEMO_ENCOUNTER_JD:.6f}"
    async with SessionLocal() as session:
        asteroid = await session.get(Asteroid, DEMO_DESIGNATION)
        if asteroid is None:
            asteroid = Asteroid(designation=DEMO_DESIGNATION, **_ORBIT)
            session.add(asteroid)
        for key, value in _ORBIT.items():
            setattr(asteroid, key, value)
        asteroid.fullname = "模拟 B 平面概率演示体"
        asteroid.orbit_solution_id = "DEMO-1"
        asteroid.name_zh = "模拟撞击演示体"
        asteroid.orbit_class = "模拟近地天体"
        asteroid.neo = True
        asteroid.pha = True
        asteroid.moid_au = 0.0
        asteroid.diam_km = 0.14
        asteroid.updated_at = utcnow()

        event = await session.get(SimEvent, DEMO_EVENT_ID)
        if event is None:
            event = SimEvent(id=DEMO_EVENT_ID)
            session.add(event)
        event.name = "模拟概率撞击演示体"
        event.desc = "【模拟数据】用于演示 B 平面、协方差不确定性管、遭遇概率热图和 1σ/3σ 密度廊道；不属于 JPL CAD 或 Sentry 官方风险记录。"
        event.type = "impact"
        event.target_type = "B 平面概率演示"
        event.diam_m = 140.0
        event.date_utc = DEMO_ENCOUNTER_ISO
        event.jd = DEMO_ENCOUNTER_JD
        event.a = _ORBIT["a"]
        event.e = _ORBIT["e"]
        event.i = _ORBIT["i"]
        event.om = _ORBIT["om"]
        event.w = _ORBIT["w"]
        event.miss_km = None
        event.impact_lat = None
        event.impact_lon = None
        event.burst_alt_km = 18.0
        event.shock_area_km2 = 85000.0
        event.energy_mt = 60.0
        event.lead_h = 48.0
        event.updated_at = utcnow()

        assessment = await session.get(RiskAssessment, assessment_id)
        if assessment is None:
            assessment = RiskAssessment(assessment_id=assessment_id, designation=DEMO_DESIGNATION)
            session.add(assessment)
        assessment.orbit_solution_id = "DEMO-1"
        assessment.solution_epoch_tdb = DEMO_ENCOUNTER_JD
        assessment.covariance_epoch_tdb = DEMO_ENCOUNTER_JD
        assessment.covariance_labels_json = json.dumps(_COV_LABELS, separators=(",", ":"))
        assessment.covariance_data_json = json.dumps(_COVARIANCE, separators=(",", ":"))
        assessment.covariance_elements_json = json.dumps(_COV_ELEMENTS, separators=(",", ":"))
        assessment.source_version = "simulation-v1"
        assessment.updated_at = utcnow()
        await session.commit()


if __name__ == "__main__":
    asyncio.run(seed_demo_risk_event())
