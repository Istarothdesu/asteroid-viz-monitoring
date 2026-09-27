"""事件推演服务: 按需 N 体积分 (P1-1), 供 POST /api/propagate 调用。

触发方式: 用户在前端对某个事件点"N 体推演" —— 单天体、单窗口, 一次积分
(DOP853, 典型耗时 < 1s), 结果按 (designation, 窗口, 步长) 进程内缓存。

初值策略: 该天体有烘焙星历 (asteroid_ephemeris) 时取最近网格点的全摄动态;
否则用 SBDB 全精度根数在历元时刻的密切状态 (kepler_state)。
"""

import asyncio
import logging
import math

from sqlalchemy import select

from db import Asteroid, AsteroidEphemeris, PlanetEphemeris, SessionLocal
from nbody import PerturberField, grid_state, integrate, kepler_state

log = logging.getLogger(__name__)

MAX_SPAN_D = 3652.5     # 单次推演窗口上限 10 年
MAX_POINTS = 20000      # 输出点数上限
_CACHE_MAX = 64

# 进程内缓存: 摄动场 (行星星历表只读不变) 与推演结果
_field: PerturberField | None = None
_arc_cache: dict[tuple, dict] = {}


async def _get_field() -> PerturberField:
    global _field
    if _field is None:
        async with SessionLocal() as session:
            rows = (await session.execute(select(PlanetEphemeris))).scalars().all()
        _field = PerturberField(list(rows))
    return _field


async def _initial_state(des: str, t0: float, orbit_solution_id: str | None = None):
    """返回 (jd_init, state0, source, actual_solution_id)。

    ``orbit_solution_id`` 是事件引用版本，只用于结果溯源；历史 CAD 解与当前
    SBDB 解不同是正常的数据演进，不应阻断使用当前快照重算。
    """
    async with SessionLocal() as session:
        aeph = await session.get(AsteroidEphemeris, des)
        row = await session.get(Asteroid, des)
    if (
        aeph is not None
        and row is not None
        and aeph.orbit_solution_id is not None
        and aeph.orbit_solution_id == row.orbit_solution_id
    ):
        jd_init, state0 = grid_state(aeph, t0)
        return jd_init, state0, "ephemeris", row.orbit_solution_id if row else None
    if row is None:
        return None
    p, v = kepler_state(row.a, row.e, row.i, row.om, row.w, row.m0, row.epoch_jd)
    return row.epoch_jd, (*p, *v), "elements", row.orbit_solution_id


def _run(des: str, t0: float, t1: float, step_d: float,
         jd_init: float, state0: tuple, field: PerturberField) -> dict:
    """同步积分主体 (在 worker 线程跑)，输出严格限制在 ``[t0, t1]``。

    初值历元常早于事件窗口数年。此前会把这段预热积分的全部采样也返回，
    使最近点搜索错误命中历史近遇；预热阶段现在只取终点状态。
    """
    legs: list[tuple[float, tuple]] = []
    if jd_init <= t0:
        state_at_t0 = state0 if jd_init == t0 else integrate(
            state0, jd_init, t0, field, abs(t0 - jd_init),
        )[1][-1]
        jds, states = integrate(state_at_t0, t0, t1, field, step_d)
        legs = list(zip(jds, states))
    elif jd_init >= t1:
        state_at_t1 = integrate(state0, jd_init, t1, field, abs(t1 - jd_init))[1][-1]
        jds, states = integrate(state_at_t1, t1, t0, field, step_d)
        legs = list(zip(jds, states))
    else:
        jds, states = integrate(state0, jd_init, t0, field, step_d)
        legs += list(zip(jds, states))
        jds, states = integrate(state0, jd_init, t1, field, step_d)
        legs += list(zip(jds, states))
    by_jd = {round(jd, 9): (jd, s) for jd, s in legs}  # 初值点双腿共有, 去重
    pts = sorted(by_jd.values())
    return {
        "designation": des,
        "initJd": jd_init,
        "points": [[round(jd, 6), *s[:3]] for jd, s in pts],
    }


async def propagate(
    des: str, t0: float, t1: float, step_d: float,
    orbit_solution_id: str | None = None,
) -> dict | None:
    """推演 [t0, t1] 窗口的日心黄道轨迹弧。天体不存在返回 None。"""
    if not (t1 > t0):
        raise ValueError("t1 必须大于 t0")
    if t1 - t0 > MAX_SPAN_D:
        raise ValueError(f"推演窗口超过上限 {MAX_SPAN_D:.0f} 天")
    if not (0 < step_d) or math.ceil((t1 - t0) / step_d) + 2 > MAX_POINTS:
        raise ValueError(f"输出点数超过上限 {MAX_POINTS}, 请加大 stepD")

    key = (des, round(t0, 6), round(t1, 6), round(step_d, 6), orbit_solution_id)
    if key in _arc_cache:
        return _arc_cache[key]

    field = await _get_field()
    init = await _initial_state(des, t0, orbit_solution_id)
    if init is None:
        return None
    jd_init, state0, source, actual_solution_id = init

    # CPU 密集 (典型 <1s), 放到 worker 线程避免阻塞事件循环
    result = await asyncio.to_thread(_run, des, t0, t1, step_d, jd_init, state0, field)
    result["source"] = source
    result["requestedOrbitSolutionId"] = orbit_solution_id
    result["orbitSolutionId"] = actual_solution_id
    result["orbitSolutionMatch"] = (
        orbit_solution_id is None or orbit_solution_id == actual_solution_id
    )
    if len(_arc_cache) >= _CACHE_MAX:
        _arc_cache.pop(next(iter(_arc_cache)))
    _arc_cache[key] = result
    log.info("推演完成: %s [%s, %s] step=%s 初值=%s @%.1f, %d 点",
             des, t0, t1, step_d, source, jd_init, len(result["points"]))
    return result


async def propagate_state(
    state0: tuple, jd_init: float, t0: float, t1: float, step_d: float,
) -> dict:
    """从调用方提供的日心状态传播轨迹。

    风险样本传播使用该入口，避免把协方差扰动过的状态写入 Asteroid 表。调用方
    必须先把工作量限制在小窗口内；此函数与 ``propagate`` 共用相同摄动模型。
    """
    if not (t1 > t0):
        raise ValueError("t1 必须大于 t0")
    if t1 - t0 > MAX_SPAN_D:
        raise ValueError(f"推演窗口超过上限 {MAX_SPAN_D:.0f} 天")
    if not (0 < step_d) or math.ceil((t1 - t0) / step_d) + 2 > MAX_POINTS:
        raise ValueError(f"输出点数超过上限 {MAX_POINTS}, 请加大 stepD")
    field = await _get_field()
    return await asyncio.to_thread(_run, "covariance-sample", t0, t1, step_d, jd_init, state0, field)
