"""概率风险数据的持久化与 DTO 组装。

本模块只处理可追溯的数据快照，不在请求路径上伪造 B 平面或撞击概率。
样本传播、B 平面投影与走廊生成将在下一阶段消费同一份协方差快照。
"""

import asyncio
import json
import math

import numpy as np
from scipy.special import ndtri
from scipy.optimize import minimize_scalar
from scipy.stats import qmc

from sqlalchemy import select

from bplane import bplane_from_relative_state
from db import Asteroid, PlanetEphemeris, RiskAssessment, SentryRisk, SessionLocal, utcnow
from nbody import JD_J2000, KGAUSS, hermite, kepler_state
from propagate_service import MAX_SPAN_D, propagate_state

_COVARIANCE_PARAMETERS = ("e", "q", "tp", "node", "peri", "i")
_DISPLAY_SPAN_D = 14.0
_LOCAL_ALGORITHM_VERSION = 2
_LOCAL_CACHE_MAX = 32
_local_cache: dict[tuple, dict] = {}
_local_inflight: dict[tuple, asyncio.Task] = {}


def assessment_id(cov: dict) -> str:
    """同一目标、解编号和协方差历元得到稳定键，重复同步可安全覆盖。"""
    orbit_id = cov.get("orbit_solution_id") or "unknown"
    return f"{cov['designation']}:{orbit_id}:{cov['covariance_epoch_tdb']:.6f}"


async def upsert_assessment(session, cov: dict) -> RiskAssessment:
    aid = assessment_id(cov)
    row = await session.get(RiskAssessment, aid)
    if row is None:
        row = RiskAssessment(assessment_id=aid, designation=cov["designation"])
        session.add(row)
    row.orbit_solution_id = cov.get("orbit_solution_id")
    row.solution_epoch_tdb = cov.get("solution_epoch_tdb")
    row.covariance_epoch_tdb = cov["covariance_epoch_tdb"]
    row.covariance_labels_json = json.dumps(cov["labels"], separators=(",", ":"))
    row.covariance_data_json = json.dumps(cov["data"], separators=(",", ":"))
    row.covariance_elements_json = json.dumps(cov.get("elements") or {}, separators=(",", ":"))
    row.source_version = cov.get("source_version")
    row.updated_at = utcnow()
    return row


async def latest_assessment(
    session, designation: str, orbit_solution_id: str | None = None,
) -> RiskAssessment | None:
    stmt = select(RiskAssessment).where(RiskAssessment.designation == designation)
    if orbit_solution_id is not None:
        stmt = stmt.where(RiskAssessment.orbit_solution_id == orbit_solution_id)
    return (await session.execute(
        stmt
        .order_by(RiskAssessment.updated_at.desc())
        .limit(1)
    )).scalar_one_or_none()


async def resolve_assessment(
    session, designation: str, preferred_version: str | None = None,
) -> RiskAssessment | None:
    """优先解析事件引用版本；本地没有历史快照时再降级到最新版。"""
    if preferred_version is not None:
        exact = await latest_assessment(session, designation, preferred_version)
        if exact is not None:
            return exact
    return await latest_assessment(session, designation)


def assessment_has_usable_covariance(row: RiskAssessment | None) -> bool:
    """风险传播至少需要标准六根数及其同历元中心值。"""
    if row is None:
        return False
    try:
        labels = json.loads(row.covariance_labels_json)
        values = json.loads(row.covariance_elements_json or "{}")
    except (TypeError, json.JSONDecodeError):
        return False
    return all(label in labels and label in values for label in _COVARIANCE_PARAMETERS)


def assessment_dto(row: RiskAssessment | None) -> dict | None:
    if row is None:
        return None
    return {
        "assessmentId": row.assessment_id,
        "orbitSolutionId": row.orbit_solution_id,
        "solutionEpochTdb": row.solution_epoch_tdb,
        "covarianceEpochTdb": row.covariance_epoch_tdb,
        "labels": json.loads(row.covariance_labels_json),
        "matrix": json.loads(row.covariance_data_json),
        "elements": json.loads(row.covariance_elements_json or "{}"),
        "sourceVersion": row.source_version,
        "updatedAt": row.updated_at.isoformat(),
    }


def sentry_dto(row: SentryRisk | None) -> dict | None:
    if row is None:
        return None
    return {
        "designation": row.designation,
        "fullname": row.fullname,
        "sentryId": row.sentry_id,
        "impactProbability": row.impact_probability,
        "virtualImpactorCount": row.virtual_impactor_count,
        "palermoCum": row.palermo_cum,
        "palermoMax": row.palermo_max,
        "torinoMax": row.torino_max,
        "vinfKms": row.vinf_kms,
        "impactRange": row.impact_range,
        "lastObs": row.last_obs,
        "sourceVersion": row.source_version,
        "updatedAt": row.updated_at.isoformat(),
    }


async def nominal_bplane(
    designation: str, encounter_jd: float, orbit_solution_id: str | None = None,
) -> dict | None:
    """以现有 N 体传播弧和地球星历计算名义 B 平面，不触碰协方差。"""
    # ±3 天、14.4 分钟输出步长只用于粗定位，最近点由局部二次插值继续精化。
    from propagate_service import propagate

    async with SessionLocal() as session:
        asteroid = await session.get(Asteroid, designation)
    arc = await propagate(
        designation, encounter_jd - 3, encounter_jd + 3, 0.01,
        orbit_solution_id,
    )
    if arc is None:
        return None
    async with SessionLocal() as session:
        earth = await session.get(PlanetEphemeris, "earth")
    if earth is None:
        raise ValueError("planet_ephemeris 未烘焙，无法计算地球遭遇 B 平面")
    out = _bplane_from_arc(arc, earth, encounter_jd)
    out.update({
        "designation": designation,
        "requestedEncounterJd": encounter_jd,
        "source": "nominal-nbody",
        "propagationSource": arc["source"],
        "orbitSolutionId": asteroid.orbit_solution_id if asteroid is not None else None,
        "requestedOrbitSolutionId": orbit_solution_id,
        "orbitSolutionMatch": arc["orbitSolutionMatch"],
    })
    return out


def _covariance_input(row: RiskAssessment) -> tuple[np.ndarray, np.ndarray]:
    """提取 SBDB 标准六根数子空间；非引力参数保留在快照中但不混入局部模型。"""
    labels = json.loads(row.covariance_labels_json)
    values = json.loads(row.covariance_elements_json or "{}")
    matrix = np.asarray(json.loads(row.covariance_data_json), dtype=float)
    try:
        indices = [labels.index(label) for label in _COVARIANCE_PARAMETERS]
        center = np.asarray([float(values[label]) for label in _COVARIANCE_PARAMETERS])
    except (ValueError, KeyError, TypeError) as exc:
        raise ValueError("SBDB 协方差缺少标准六根数中心值，无法执行局部样本传播") from exc
    cov = matrix[np.ix_(indices, indices)]
    if not np.all(np.isfinite(cov)) or not np.all(np.isfinite(center)):
        raise ValueError("SBDB 协方差含非有限数值")
    try:
        return center, np.linalg.cholesky((cov + cov.T) / 2)
    except np.linalg.LinAlgError as exc:
        raise ValueError("SBDB 六根数协方差不是正定矩阵，无法构造样本") from exc


def _state_from_covariance_elements(values: np.ndarray, epoch_jd: float) -> tuple:
    """SBDB ``e,q,tp,node,peri,i`` 中心/扰动值转为日心笛卡尔初值。"""
    e, q, tp, node, peri, inc = values
    if not (0 <= e < 1 and q > 0):
        raise ValueError("协方差样本产生了非椭圆轨道，局部线性模型不适用")
    a = q / (1 - e)
    n = KGAUSS / (a * math.sqrt(a))
    mean_at_epoch = (n * (epoch_jd - tp)) % (2 * math.pi)
    m0 = math.degrees(mean_at_epoch - n * (epoch_jd - JD_J2000))
    p, v = kepler_state(a, e, inc, node, peri, m0, epoch_jd)
    return (*p, *v)


def _bplane_from_arc(arc: dict, earth: PlanetEphemeris, encounter_jd: float) -> dict:
    """粗网格定位后，在相邻三点的相对位置二次插值上精化最近点。"""
    points = arc["points"]
    if len(points) < 3:
        raise ValueError("传播弧采样不足，无法计算 B 平面")
    best_i, best_d2 = 1, math.inf
    for i, point in enumerate(points):
        ep = hermite(earth, point[0])
        d2 = sum((point[k + 1] - ep[k]) ** 2 for k in range(3))
        if d2 < best_d2:
            best_i, best_d2 = i, d2
    if best_i == 0 or best_i == len(points) - 1:
        raise ValueError("样本最近遭遇位于窗口边缘，局部模型不适用")
    triplet = points[best_i - 1:best_i + 2]
    t_mid = triplet[1][0]
    offsets = np.asarray([point[0] - t_mid for point in triplet], dtype=float)
    relative = np.asarray([
        [point[k + 1] - hermite(earth, point[0])[k] for k in range(3)]
        for point in triplet
    ])
    # 每一坐标分别拟合 r(u)=a·u²+b·u+c；随后直接最小化 |r(u)|²。
    coefficients = np.asarray([
        np.polyfit(offsets, relative[:, axis], 2) for axis in range(3)
    ])

    def state_at(offset: float) -> tuple[np.ndarray, np.ndarray]:
        position = coefficients[:, 0] * offset**2 + coefficients[:, 1] * offset + coefficients[:, 2]
        velocity = 2 * coefficients[:, 0] * offset + coefficients[:, 1]
        return position, velocity

    optimum = minimize_scalar(
        lambda offset: float(np.dot(state_at(offset)[0], state_at(offset)[0])),
        bounds=(float(offsets[0]), float(offsets[-1])), method="bounded",
        options={"xatol": 1e-11},
    )
    refined_offset = float(optimum.x)
    r, v = state_at(refined_offset)
    out = bplane_from_relative_state(tuple(r), tuple(v))
    out.update({
        "closestJd": t_mid + refined_offset,
        "closestDistanceKm": float(np.linalg.norm(r) * 149597870.7),
    })
    return out


def _uncertainty_tube(nominal_arc: dict, sample_arcs: list[dict], max_sections: int = 80) -> dict:
    """把同一时间网格上的 sigma 轨迹压缩为 3σ 椭圆截面。

    只输出渲染所需的中心、两条主轴和半径，避免把完整高频样本数组长期存储或
    传到前端。中心固定为名义轨迹；12 个 ±√6 sigma 点的等权二阶矩恰与原始
    协方差的一阶线性传播口径一致。
    """
    points = nominal_arc["points"]
    if not points or any(len(arc["points"]) != len(points) for arc in sample_arcs):
        raise ValueError("sigma 轨迹时间网格不一致，无法构造不确定性管")
    count = min(max_sections, len(points))
    indices = sorted({round(k * (len(points) - 1) / max(1, count - 1)) for k in range(count)})
    sections = []
    previous_axis: np.ndarray | None = None
    for index in indices:
        center = np.asarray(points[index][1:4], dtype=float)
        samples = np.asarray([arc["points"][index][1:4] for arc in sample_arcs], dtype=float)
        deviations = samples - center
        covariance = deviations.T @ deviations / len(sample_arcs)
        if index == 0:
            tangent = np.asarray(points[1][1:4], dtype=float) - center
        elif index == len(points) - 1:
            tangent = center - np.asarray(points[-2][1:4], dtype=float)
        else:
            tangent = (
                np.asarray(points[index + 1][1:4], dtype=float)
                - np.asarray(points[index - 1][1:4], dtype=float)
            )
        tangent /= np.linalg.norm(tangent)
        projector = np.eye(3) - np.outer(tangent, tangent)
        normal_covariance = projector @ covariance @ projector
        values, vectors = np.linalg.eigh((normal_covariance + normal_covariance.T) / 2)
        axis_a = vectors[:, int(np.argmax(values))]
        axis_a -= tangent * np.dot(axis_a, tangent)
        axis_a /= np.linalg.norm(axis_a)
        if previous_axis is not None and np.dot(previous_axis, axis_a) < 0:
            axis_a = -axis_a
        axis_b = np.cross(tangent, axis_a)
        axis_b /= np.linalg.norm(axis_b)
        previous_axis = axis_a
        variance_a = float(axis_a @ covariance @ axis_a)
        variance_b = float(axis_b @ covariance @ axis_b)
        sections.append({
            "jd": points[index][0],
            "centerEclipticAu": center.tolist(),
            "axisAEcliptic": axis_a.tolist(),
            "axisBEcliptic": axis_b.tolist(),
            "radiusAAu": math.sqrt(max(0.0, variance_a)) * 3,
            "radiusBAu": math.sqrt(max(0.0, variance_b)) * 3,
        })
    return {"confidenceSigma": 3, "sections": sections}


def _nominal_trajectory(arc: dict, max_points: int = 561) -> dict:
    """事件专题完整观察窗内的同源名义轨迹，供前端平滑驱动目标位置。"""
    points = arc["points"]
    count = min(max_points, len(points))
    indices = sorted({round(k * (len(points) - 1) / max(1, count - 1)) for k in range(count)})
    return {
        "points": [
            {"jd": points[index][0], "centerEclipticAu": points[index][1:4]}
            for index in indices
        ],
    }


async def local_bplane_uncertainty(
    designation: str, encounter_jd: float, sample_count: int = 4096,
    orbit_solution_id: str | None = None,
) -> dict | None:
    """局部线性 B 平面协方差与二维 Sobol 积分。

    这不是 Sentry 的虚拟撞击体解算：先用 12 个六根数 sigma 状态经相同 N 体
    摄动场传播，得到 B 平面雅可比的数值近似，再在该二维高斯上积分有效撞击圆。
    因此仅允许协方差历元 10 年内的近遇，远期风险仍应使用 Sentry 官方结果。
    """
    async with SessionLocal() as session:
        row = await resolve_assessment(session, designation, orbit_solution_id)
        earth = await session.get(PlanetEphemeris, "earth")
    if row is None:
        return None
    if earth is None:
        raise ValueError("planet_ephemeris 未烘焙，无法计算局部 B 平面协方差")
    if abs(encounter_jd - row.covariance_epoch_tdb) > MAX_SPAN_D:
        raise ValueError("协方差历元距遭遇超过 10 年；局部线性概率已禁用，请使用 Sentry 官方风险")
    cache_key = (
        row.assessment_id, round(encounter_jd, 9), sample_count,
        orbit_solution_id, _LOCAL_ALGORITHM_VERSION,
    )
    if cache_key in _local_cache:
        return _local_cache[cache_key]
    if cache_key in _local_inflight:
        return await asyncio.shield(_local_inflight[cache_key])

    async def calculate() -> dict:
        return await _calculate_local_bplane_uncertainty(
            designation, encounter_jd, sample_count, row, earth,
            orbit_solution_id,
        )

    task = asyncio.create_task(calculate())
    _local_inflight[cache_key] = task
    try:
        result = await asyncio.shield(task)
        if len(_local_cache) >= _LOCAL_CACHE_MAX:
            _local_cache.pop(next(iter(_local_cache)))
        _local_cache[cache_key] = result
        return result
    finally:
        _local_inflight.pop(cache_key, None)


async def _calculate_local_bplane_uncertainty(
    designation: str, encounter_jd: float, sample_count: int,
    row: RiskAssessment, earth: PlanetEphemeris,
    requested_orbit_solution_id: str | None,
) -> dict:
    center, chol = _covariance_input(row)
    nominal_arc = await propagate_state(
        _state_from_covariance_elements(center, row.covariance_epoch_tdb),
        row.covariance_epoch_tdb, encounter_jd - 3, encounter_jd + 3, 0.01,
    )
    # 3σ 管只需覆盖近遭遇局部，但事件时间轴可前后观察十余天。两者必须来自
    # 同一协方差中心状态，绝不能在窗口边缘退回 CAD 拟合轨道。
    display_arc = await propagate_state(
        _state_from_covariance_elements(center, row.covariance_epoch_tdb),
        row.covariance_epoch_tdb,
        encounter_jd - _DISPLAY_SPAN_D, encounter_jd + _DISPLAY_SPAN_D, 0.05,
    )
    nominal = _bplane_from_arc(nominal_arc, earth, encounter_jd)
    xi_axis = np.asarray(nominal["xiAxisEcliptic"], dtype=float)
    zeta_axis = np.asarray(nominal["zetaAxisEcliptic"], dtype=float)

    async def sigma(sign: float, col: int) -> tuple[np.ndarray, dict]:
        state = _state_from_covariance_elements(center + sign * math.sqrt(6) * chol[:, col], row.covariance_epoch_tdb)
        arc = await propagate_state(state, row.covariance_epoch_tdb, encounter_jd - 3, encounter_jd + 3, 0.01)
        result = _bplane_from_arc(arc, earth, encounter_jd)
        b = np.asarray(result["bVectorEclipticKm"], dtype=float)
        return np.asarray([np.dot(b, xi_axis), np.dot(b, zeta_axis)]), arc

    # 限制并发，避免一次点击启动 12 个 DOP853 求解器挤占 UI/API 线程池。
    gate = asyncio.Semaphore(3)
    async def guarded(sign: float, col: int) -> np.ndarray:
        async with gate:
            return await sigma(sign, col)
    outcomes = await asyncio.gather(*(
        guarded(sign, col) for col in range(6) for sign in (-1.0, 1.0)
    ))
    b_cov = np.zeros((2, 2))
    for col in range(6):
        minus, plus = outcomes[col * 2][0], outcomes[col * 2 + 1][0]
        derivative_times_chol = (plus - minus) / (2 * math.sqrt(6))
        b_cov += np.outer(derivative_times_chol, derivative_times_chol)
    try:
        b_chol = np.linalg.cholesky((b_cov + b_cov.T) / 2)
    except np.linalg.LinAlgError as exc:
        raise ValueError("投影后的 B 平面协方差退化，局部概率不可用") from exc
    power = int(math.log2(sample_count))
    n = 2 ** max(8, min(14, power))
    sobol = qmc.Sobol(d=2, scramble=False).random_base2(int(math.log2(n)))
    z = ndtri(np.clip(sobol, 1e-12, 1 - 1e-12))
    mean = np.asarray([nominal["xiKm"], nominal["zetaKm"]])
    points = mean + z @ b_chol.T
    hit_count = int(np.count_nonzero(np.sum(points * points, axis=1) <= nominal["effectiveImpactRadiusKm"] ** 2))
    return {
        "designation": designation,
        "method": "local-linear-nbody-sobol",
        "sampleCount": n,
        "hitCount": hit_count,
        "localImpactProbability": hit_count / n,
        "bPlaneCovarianceKm2": b_cov.tolist(),
        "uncertaintyTube": _uncertainty_tube(nominal_arc, [outcome[1] for outcome in outcomes]),
        "nominalTrajectory": _nominal_trajectory(display_arc),
        "nominalBPlane": {
            **nominal,
            "designation": designation,
            "requestedEncounterJd": encounter_jd,
            "source": "local-covariance-nbody",
            "propagationSource": "covariance-elements",
            "orbitSolutionId": row.orbit_solution_id,
            "requestedOrbitSolutionId": requested_orbit_solution_id,
            "orbitSolutionMatch": requested_orbit_solution_id is None or row.orbit_solution_id == requested_orbit_solution_id,
        },
        "assessmentId": row.assessment_id,
        "requestedOrbitSolutionId": requested_orbit_solution_id,
        "orbitSolutionId": row.orbit_solution_id,
        "orbitSolutionMatch": requested_orbit_solution_id is None or row.orbit_solution_id == requested_orbit_solution_id,
        "covarianceEpochTdb": row.covariance_epoch_tdb,
        "ignoredLabels": [label for label in json.loads(row.covariance_labels_json) if label not in _COVARIANCE_PARAMETERS],
    }
