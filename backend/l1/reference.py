"""固定版本的三体参考轨道；动力学验证与场景随动映射分开。"""
from functools import lru_cache

import numpy as np
from scipy.integrate import solve_ivp

SOURCE = "https://ssd-api.jpl.nasa.gov/periodic_orbits.api?sys=sun-earth&family=halo&libr=1&branch=N&periodmin=170&periodmax=190&periodunits=d"
MU = 3.0542e-6
TIME_UNIT_S = 5022635.34820215
PERIOD = 3.0530728500125566
SEED = [0.98891420553289477, 0.0, 0.0030040412483433019,
        -2.5414176186507968e-16, 0.010113524775185567, -1.9742621674134934e-17]

PROFILE = {
    "id": "l1-survey-reference-v3", "version": 3, "kind": "simulation",
    "name": "L1 巡天仿真参考配置", "timeScale": "TDB",
    "epochJdTdb": 2451545.0,
    "frame": "ECLIPJ2000", "positionUnit": "AU", "velocityUnit": "AU/day",
    # 自定义仪器与巡天假设，不冒充 NASA 任务实际设计参数。
    "instrument": {"fovWidthDeg": 6.0, "fovHeightDeg": 4.0,
                   "sunAvoidanceDeg": 45.0, "maxSunElongationDeg": 125.0,
                   "earthAvoidanceMarginDeg": 5.0},
    "survey": {"minSolarLongitudeDeg": 45.0, "maxSolarLongitudeDeg": 120.0,
               "maxLatitudeDeg": 40.0},
    # 仅供展示用计划生成器；正式策略将由外部系统输入。
    "demo": {"slewRateDegPerSec": 0.2, "slewAccelerationDegPerSec2": 0.04,
             "settleSeconds": 10, "exposureSeconds": 20, "readoutSeconds": 5,
             "exposuresPerVisit": 6, "visitsPerField": 4, "revisitHours": 2,
             "gridColumns": 4, "gridRows": 4, "overlapFraction": 0.1},
    "surveyReference": "https://arxiv.org/html/2310.12918v1#S3",
    "calibration": {"cycleDays": 7, "durationHours": 2},
    "assumptions": ["仪器与转向、曝光参数为自定义仿真假设；仅参考 NEO Surveyor 分区复访思路",
                    "地球规避半角为动态地球视半径外扩 5°；5° 是可替换的演示杂散光余量，并非 NASA 任务参数",
                    "局部天区计划不是 NASA 全巡天方案；计划回放与真实执行反馈分开",
                    "仅做保守视场包络和离散时间几何检查；未建模信噪比、探测、遥测及完整工程约束",
                    "三体周期解经日地星历随动缩放映射，不是飞行任务的摄动星历",
                    "理想周期解不含轨道维持、辐射压及其他天体扰动；卫星模型为示意比例",
                    "参考相位人为对齐 J2000 TDB；视线为几何方向，不含光行时与光行差"],
}


def dynamics(_t, s):
    x, y, z, vx, vy, vz = s
    r1 = ((x + MU)**2 + y*y + z*z)**1.5
    r2 = ((x - 1 + MU)**2 + y*y + z*z)**1.5
    a = (1 - MU) / r1
    b = MU / r2
    return [vx, vy, vz, 2*vy + x - a*(x + MU) - b*(x - 1 + MU),
            -2*vx + y - (a + b)*y, -(a + b)*z]


def jacobi(s):
    x, y, z, vx, vy, vz = s
    r1 = np.sqrt((x + MU)**2 + y*y + z*z)
    r2 = np.sqrt((x - 1 + MU)**2 + y*y + z*z)
    return x*x + y*y + 2*(1 - MU)/r1 + 2*MU/r2 - vx*vx - vy*vy - vz*vz


@lru_cache(maxsize=1)
def reference_packet():
    times = np.linspace(0, PERIOD, 2049)
    sol = solve_ivp(dynamics, (0, PERIOD), SEED, method="DOP853",
                    t_eval=times, rtol=2e-12, atol=2e-14)
    closure = float(np.linalg.norm(sol.y[:3, -1] - sol.y[:3, 0]))
    drift = float(np.max(np.abs(jacobi(sol.y) - jacobi(np.array(SEED)))))
    if not sol.success or closure > 1e-8 or drift > 1e-10:
        raise RuntimeError("L1 三体参考轨道验证失败")
    return {
        "profile": PROFILE,
        "orbit": {"model": "CR3BP-halo-following-map", "source": SOURCE,
                  "sourceVersion": "NASA/JPL periodic orbits API 1.0",
                  "seedRetrievedOn": "2026-09-18",
                  "frame": "barycentric-synodic", "stateUnits": "normalized-CR3BP",
                  "massRatio": MU, "lengthUnitAu": 1.0, "timeUnitSeconds": TIME_UNIT_S,
                  "l1SynodicX": 0.989970922056916,
                  "phaseEpochJdTdb": PROFILE["epochJdTdb"], "periodNormalized": PERIOD,
                  "periodDays": PERIOD * TIME_UNIT_S / 86400,
                  "samples": sol.y.T.tolist(),
                  "validation": {"closureAu": closure, "jacobiDrift": drift}},
    }
