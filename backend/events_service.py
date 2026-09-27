"""事件中心统一目录服务: 三源汇聚 + 服务端过滤/排序/分页/计数。

三个数据源:
 · builtin —— 内置经典事件 (builtin_events.json, 随镜像发布, 进程内常驻)
 · cad     —— JPL CAD 真实接近事件 (close_approaches 表, 定时同步)
 · sim     —— 用户推演事件 (sim_events 表, 前端 CRUD)

派生口径 (原前端 eventCenter.ts 的规则, 迁到服务端后成为唯一口径):
 · 直径   —— CAD 缺 diam_km 时按 H 星等估算 (反照率 0.15), 再缺则 0.05 km;
 · 危险等级 —— 撞击按 TNT 当量分档, 飞掠按最近距离 (LD) 与直径分档;
 · 时序分类 —— 相对显式分析基准 now_jd 分 未来一年/远期/历史;
 · 排序   —— 当前 → 远期 → 历史; 前两组按时刻升序, 历史按时刻降序。

规模假设: CAD 单次同步入库数百条 (date >= today 且 dist <= 20 LD), 三源合计
千级以内。故入库两源只做 SQL 粗过滤 (类型 / 时间范围, 命中 jd 索引),
内置目录在内存按同一口径粗过滤; 关键字与派生量 (等级、时序) 过滤及
排序分页统一在 Python 内完成, 与历史前端口径逐条对齐;
若将来量级上升, 再把派生规则下沉为 SQL 表达式或物化列。
"""

import json
import math
from calendar import monthrange
from dataclasses import dataclass
from datetime import date, datetime, timezone
from itertools import chain
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import CloseApproach, SimEvent
from risk_demo import DEMO_DESIGNATION, DEMO_EVENT_ID

LD_KM = 384400.0
"""月地平均距离 (km)"""

YEAR_DAYS = 365.25
"""「当前」页签的前瞻跨度 (天)"""

JD_UNIX_EPOCH = 2440587.5
MS_PER_DAY = 86400000.0

# 撞击动能估算常量 (与前端 utils/orbital/impact.ts 同源)
IMPACT_DENSITY = 3000.0
IMPACT_SPEED = 20000.0
JOULE_PER_MT = 4.184e15

# CAD 缺直径时的 H → 直径估算反照率 (与前端 eventCenter.diamFromH 同源)
ALBEDO_FALLBACK = 0.15
DIAM_FLOOR_KM = 0.05

CAD_LEAD_H = 48.0
"""CAD 事件无预警提前期字段, 统一取 48 h (与历史前端口径一致)"""

SOURCES = ("builtin", "cad", "sim")
TYPES = ("impact", "flyby")
SEVERITIES = ("critical", "high", "medium", "low")
CATEGORIES = ("current", "upcoming", "past")

_CAT_ORDER = {"current": 0, "upcoming": 1, "past": 2}


# ---------------------------------------------------------------------------
# 时间与物理量换算
# ---------------------------------------------------------------------------

def jd_from_iso(value: str) -> float:
    """ISO8601 (尾缀 Z 或裸 UTC) → 儒略日。"""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp() * 1000.0 / MS_PER_DAY + JD_UNIX_EPOCH


def jd_from_date(value: date, *, end_of_day: bool = False) -> float:
    """日期 (UTC) → 当日 00:00 的儒略日; end_of_day 时取次日 00:00 (作开区间上界)。"""
    jd = jd_from_iso(f"{value.isoformat()}T00:00:00Z")
    return jd + 1.0 if end_of_day else jd


def now_jd_utc() -> float:
    """真实当前时刻的儒略日 (前端未传 now_jd 时的兜底)。"""
    return datetime.now(timezone.utc).timestamp() * 1000.0 / MS_PER_DAY + JD_UNIX_EPOCH


def diam_from_h(h: float) -> float:
    """H 绝对星等 → 直径估算 (km), 反照率取 0.15 (S/C 型石质均值)。"""
    return (1329.0 / math.sqrt(ALBEDO_FALLBACK)) * 10.0 ** (-h / 5.0)


def estimate_energy_mt(diam_m: float) -> float:
    """动能估算: 球体质量 × v²/2, 换算为 Mt TNT 当量 (50 米 ≈ 9.4 Mt)。"""
    mass = IMPACT_DENSITY * (math.pi / 6.0) * max(diam_m, 0.1) ** 3
    return (0.5 * mass * IMPACT_SPEED**2) / JOULE_PER_MT


def impact_severity(energy_mt: float) -> str:
    """撞击事件: 按能量分档 (通古斯 12 Mt 级 → 极高; 车里雅宾斯克 0.44 Mt → 中)。"""
    if energy_mt >= 10:
        return "critical"
    if energy_mt >= 1:
        return "high"
    if energy_mt >= 0.01:
        return "medium"
    return "low"


def flyby_severity(miss_km: float, diam_km: float) -> str:
    """飞掠事件: 按最近距离 (LD) 与直径分档。"""
    ld = miss_km / LD_KM
    if ld <= 0.25:
        return "critical" if diam_km >= 0.1 else "high"
    if ld <= 2:
        return "high"
    if ld <= 10:
        return "medium"
    return "low"


def categorize(jd: float, now_jd: float) -> str:
    """按发生时刻相对 now_jd 分类: 已发生 / 一年内将发生 / 一年后将发生。"""
    if jd < now_jd:
        return "past"
    return "current" if jd <= now_jd + YEAR_DAYS else "upcoming"


# ---------------------------------------------------------------------------
# 内置经典事件 (随镜像发布的静态目录)
# ---------------------------------------------------------------------------

_BUILTIN_PATH = Path(__file__).resolve().parent / "builtin_events.json"
_builtin_cache: list[dict[str, Any]] | None = None


def load_builtin() -> list[dict[str, Any]]:
    """内置经典事件目录: 字段与前端 EventRecord 对齐, 额外带 target (风险目标)。"""
    global _builtin_cache
    if _builtin_cache is None:
        _builtin_cache = json.loads(_BUILTIN_PATH.read_text(encoding="utf-8"))
    return _builtin_cache


def builtin_jds() -> list[float]:
    """内置事件时刻 (常量, 计数用; 避免每次请求重复解析)。"""
    return [jd_from_iso(r["dateUTC"]) for r in load_builtin()]


def builtin_record(rec: dict[str, Any]) -> dict[str, Any]:
    """内置事件 → 前端 EventRecord (剔除目录专属的 target 字段)。"""
    return {k: v for k, v in rec.items() if k != "target"}


# ---------------------------------------------------------------------------
# 统一事件行
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class EventRow:
    """三源归一后的事件行: 列表/详情 DTO 与过滤排序均基于此结构。"""

    key: str
    source: str
    name: str
    target: str
    type: str
    date_utc: str
    jd: float
    diam: float
    diam_estimated: bool
    miss_km: float | None
    v_rel_kms: float | None
    energy_mt: float | None
    lead_h: float
    severity: str
    category: str
    desc: str | None = None
    cad: dict[str, Any] | None = None
    record: dict[str, Any] | None = None


def _severity_of(type_: str, energy_mt: float | None, miss_km: float | None, diam_km: float) -> str:
    if type_ == "impact":
        return impact_severity(energy_mt if energy_mt is not None else 0.0)
    return flyby_severity(miss_km if miss_km is not None else LD_KM, diam_km)


def builtin_row(rec: dict[str, Any], now_jd: float) -> EventRow:
    """内置经典事件 → 统一行 (撞击缺能量时按直径估算补齐)。"""
    jd = jd_from_iso(rec["dateUTC"])
    diam = float(rec["diam"])
    energy = rec.get("energyMt")
    if rec["type"] == "impact" and energy is None:
        energy = estimate_energy_mt(diam * 1000.0)
    return EventRow(
        key=f"r-{rec['id']}",
        source="builtin",
        name=rec["name"],
        target=rec.get("target") or rec["name"],
        type=rec["type"],
        date_utc=rec["dateUTC"],
        jd=jd,
        diam=diam,
        diam_estimated=False,
        miss_km=rec.get("missKm"),
        v_rel_kms=None,
        energy_mt=energy,
        lead_h=float(rec["leadH"]),
        severity=_severity_of(rec["type"], energy, rec.get("missKm"), diam),
        category=categorize(jd, now_jd),
        desc=rec.get("desc"),
        record=builtin_record(rec),
    )


def cad_dto(r: CloseApproach) -> dict[str, Any]:
    """CAD 行 → 前端 CadEvent 形状 (详情页组装复盘记录用)。

    distMinLd/distMaxLd 为 JPL CAD 发布的遭遇距离 3σ 界, 概率廊道
    的沿迹不确定度锚定来源 (缺省则廊道按钮禁用)。
    """
    cd_parts = r.cd_id.split("|", 2)
    orbit_id = cd_parts[1] if len(cd_parts) == 3 else None
    return {
        "cdId": r.cd_id,
        "orbitId": orbit_id,
        "des": r.designation,
        "fullname": r.fullname or "",
        "dateIso": r.date_iso,
        "jd": r.jd,
        "distLd": r.dist_ld,
        "distMinLd": r.dist_min_ld,
        "distMaxLd": r.dist_max_ld,
        "vRelKms": r.v_rel_kms,
        "h": r.h_mag,
        "diamKm": r.diam_km,
    }


def cad_row(r: CloseApproach, now_jd: float) -> EventRow:
    """JPL CAD 接近事件 → 统一行 (全部为飞掠, 无本地根数)。"""
    diam_estimated = r.diam_km is None
    if r.diam_km is not None:
        diam = r.diam_km
    elif r.h_mag is not None:
        diam = diam_from_h(r.h_mag)
    else:
        diam = DIAM_FLOOR_KM
    miss_km = r.dist_ld * LD_KM
    return EventRow(
        key=f"c-{r.cd_id}",
        source="cad",
        name=f"{r.designation} 接近地球",
        target=r.fullname or r.designation,
        type="flyby",
        date_utc=f"{r.date_iso}Z",
        jd=r.jd,
        diam=diam,
        diam_estimated=diam_estimated,
        miss_km=miss_km,
        v_rel_kms=r.v_rel_kms,
        energy_mt=None,
        lead_h=CAD_LEAD_H,
        severity=flyby_severity(miss_km, diam),
        category=categorize(r.jd, now_jd),
        cad=cad_dto(r),
    )


def sim_dto(r: SimEvent) -> dict[str, Any]:
    """推演事件行 → 前端 SimEvent 形状 (diam 单位米)。"""
    out: dict[str, Any] = {
        "id": r.id,
        "name": r.name,
        "desc": r.desc or "",
        "type": r.type,
        "targetType": r.target_type or "未知",
        "diam": r.diam_m,
        "dateUTC": r.date_utc,
        "el": {"a": r.a, "e": r.e, "i": r.i, "O": r.om, "w": r.w},
        "leadH": r.lead_h,
    }
    for key, val in (
        ("missKm", r.miss_km),
        ("impactLat", r.impact_lat),
        ("impactLon", r.impact_lon),
        ("burstAltKm", r.burst_alt_km),
        ("shockAreaKm2", r.shock_area_km2),
        ("energyMt", r.energy_mt),
    ):
        if val is not None:
            out[key] = val
    return out


def sim_columns(payload: dict[str, Any]) -> dict[str, Any]:
    """推演事件写入载荷 → SimEvent 列字典 (不含主键)。

    按类型落实专属字段 (飞掠只留最近距离, 撞击只留落点/空爆/能量),
    撞击未指定能量时按直径估算补齐, 与前端表单口径一致。"""
    el = payload["el"]
    is_impact = payload["type"] == "impact"
    energy = payload.get("energyMt")
    if is_impact and energy is None:
        energy = estimate_energy_mt(payload["diam"])
    return {
        "name": payload["name"].strip(),
        "desc": payload.get("desc") or None,
        "type": payload["type"],
        "target_type": payload.get("targetType"),
        "diam_m": payload["diam"],
        "date_utc": payload["dateUTC"],
        "jd": jd_from_iso(payload["dateUTC"]),
        "a": el["a"], "e": el["e"], "i": el["i"], "om": el["O"], "w": el["w"],
        "miss_km": None if is_impact else payload.get("missKm"),
        "impact_lat": payload.get("impactLat") if is_impact else None,
        "impact_lon": payload.get("impactLon") if is_impact else None,
        "burst_alt_km": payload.get("burstAltKm") if is_impact else None,
        "shock_area_km2": payload.get("shockAreaKm2") if is_impact else None,
        "energy_mt": energy if is_impact else None,
        "lead_h": payload["leadH"],
    }


def sim_record(r: SimEvent) -> dict[str, Any]:
    """推演事件 → 前端 EventRecord (diam 单位 km, 可直接用于轨道拟合/复盘)。"""
    rec: dict[str, Any] = {
        "id": r.id,
        "name": r.name,
        "type": r.type,
        "dateUTC": r.date_utc,
        "diam": r.diam_m / 1000.0,
        "leadH": r.lead_h,
        "el": {"a": r.a, "e": r.e, "i": r.i, "O": r.om, "w": r.w},
        "img": "",
        "credit": "",
        "news": "",
        "desc": r.desc or "",
    }
    for key, val in (
        ("missKm", r.miss_km),
        ("impactLat", r.impact_lat),
        ("impactLon", r.impact_lon),
        ("burstAltKm", r.burst_alt_km),
        ("shockAreaKm2", r.shock_area_km2),
        ("energyMt", r.energy_mt),
    ):
        if val is not None:
            rec[key] = val
    if r.id == DEMO_EVENT_ID:
        rec["el"]["des"] = DEMO_DESIGNATION
    return rec


def sim_row(r: SimEvent, now_jd: float) -> EventRow:
    """用户推演事件 → 统一行。"""
    diam = r.diam_m / 1000.0
    energy = r.energy_mt
    if r.type == "impact" and energy is None:
        energy = estimate_energy_mt(r.diam_m)
    return EventRow(
        key=f"s-{r.id}",
        source="sim",
        name=r.name,
        target=r.name,
        type=r.type,
        date_utc=r.date_utc,
        jd=r.jd,
        diam=diam,
        diam_estimated=False,
        miss_km=r.miss_km,
        v_rel_kms=None,
        energy_mt=energy,
        lead_h=r.lead_h,
        severity=_severity_of(r.type, energy, r.miss_km, diam),
        category=categorize(r.jd, now_jd),
        desc=r.desc or None,
        record=sim_record(r),
    )


# ---------------------------------------------------------------------------
# 查询条件与结果
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class EventQuery:
    """事件列表查询条件 (路由层校验后填充)。"""

    now_jd: float
    page: int = 1
    size: int = 10
    q: str | None = None
    type: str | None = None
    source: str | None = None
    severity: str | None = None
    category: str | None = None
    jd_from: float | None = None
    jd_to: float | None = None
    """时间范围上界 (开区间: 已含结束日整天)"""


def event_dto(r: EventRow, *, include_record: bool = False) -> dict[str, Any]:
    """统一行 → 前端 EventItem / EventDetail 形状 (缺省字段直接省略)。"""
    out: dict[str, Any] = {
        "key": r.key,
        "source": r.source,
        "name": r.name,
        "target": r.target,
        "type": r.type,
        "dateUTC": r.date_utc,
        "jdEnc": r.jd,
        "diam": r.diam,
        "leadH": r.lead_h,
        "severity": r.severity,
        "category": r.category,
    }
    if r.diam_estimated:
        out["diamEstimated"] = True
    if r.miss_km is not None:
        out["missKm"] = r.miss_km
    if r.v_rel_kms is not None:
        out["vRelKms"] = r.v_rel_kms
    if r.energy_mt is not None:
        out["energyMt"] = r.energy_mt
    if r.desc:
        out["desc"] = r.desc
    if r.cad is not None:
        out["cad"] = r.cad
    if include_record:
        out["record"] = r.record
    return out


def _sort_key(r: EventRow) -> tuple[int, float]:
    """当前 → 远期 → 历史; 历史组内按时刻倒序 (最近的已发生事件在前)。"""
    return (_CAT_ORDER[r.category], -r.jd if r.category == "past" else r.jd)


def _match(r: EventRow, qs: EventQuery) -> bool:
    """派生量过滤: 关键字 (名称/风险目标) + 危险等级 + 时序分类。"""
    if qs.severity is not None and r.severity != qs.severity:
        return False
    if qs.category is not None and r.category != qs.category:
        return False
    if qs.q:
        q = qs.q.lower()
        if q not in r.name.lower() and q not in r.target.lower():
            return False
    return True


def summarize_rows(rows: list[EventRow], now_jd: float) -> dict[str, Any]:
    """分页前结果集统计；所有数字与列表使用同一筛选和时间基准。"""
    by_severity = {key: 0 for key in SEVERITIES}
    by_type = {key: 0 for key in TYPES}
    by_source = {key: 0 for key in SOURCES}
    by_category = {key: 0 for key in CATEGORIES}
    for row in rows:
        by_severity[row.severity] += 1
        by_type[row.type] += 1
        by_source[row.source] += 1
        by_category[row.category] += 1

    base = datetime.fromtimestamp((now_jd - JD_UNIX_EPOCH) * 86400, tz=timezone.utc)
    monthly: list[dict[str, Any]] = []
    for offset in range(12):
        absolute_month = base.year * 12 + base.month - 1 + offset
        year, month_zero = divmod(absolute_month, 12)
        month = month_zero + 1
        start = date(year, month, 1)
        end = date(year, month, monthrange(year, month)[1])
        monthly.append({
            "key": f"{year:04d}-{month:02d}",
            "label": f"{month:02d}月",
            "count": sum(1 for row in rows if row.jd >= now_jd and row.date_utc[:7] == f"{year:04d}-{month:02d}"),
            "dateFrom": start.isoformat(),
            "dateTo": end.isoformat(),
        })

    future = [row for row in rows if row.jd >= now_jd]
    flybys = [row for row in rows if row.type == "flyby" and row.miss_km is not None]
    highlights = {
        "next": event_dto(min(future, key=lambda row: row.jd)) if future else None,
        "closest": event_dto(min(flybys, key=lambda row: row.miss_km if row.miss_km is not None else math.inf)) if flybys else None,
        "largest": event_dto(max(rows, key=lambda row: row.diam)) if rows else None,
    }
    return {
        "total": len(rows),
        "real": sum(1 for row in rows if row.source != "sim"),
        "simulated": by_source["sim"],
        "future365d": sum(1 for row in rows if now_jd <= row.jd <= now_jd + YEAR_DAYS),
        "highAttention": by_severity["critical"] + by_severity["high"],
        "bySeverity": by_severity,
        "byType": by_type,
        "bySource": by_source,
        "byCategory": by_category,
        "monthly": monthly,
        "highlights": highlights,
    }


async def _fetch_cad(session: AsyncSession, qs: EventQuery) -> list[CloseApproach]:
    """CAD 粗过滤: 类型 (CAD 全为飞掠) 与时间范围交给 SQL, 命中 jd 索引。"""
    if qs.type == "impact":
        return []
    stmt = select(CloseApproach)
    if qs.jd_from is not None:
        stmt = stmt.where(CloseApproach.jd >= qs.jd_from)
    if qs.jd_to is not None:
        stmt = stmt.where(CloseApproach.jd < qs.jd_to)
    return list((await session.execute(stmt.order_by(CloseApproach.jd))).scalars().all())


async def _fetch_sim(session: AsyncSession, qs: EventQuery) -> list[SimEvent]:
    stmt = select(SimEvent)
    if qs.type is not None:
        stmt = stmt.where(SimEvent.type == qs.type)
    if qs.jd_from is not None:
        stmt = stmt.where(SimEvent.jd >= qs.jd_from)
    if qs.jd_to is not None:
        stmt = stmt.where(SimEvent.jd < qs.jd_to)
    return list((await session.execute(stmt.order_by(SimEvent.jd))).scalars().all())


def _builtin_candidates(qs: EventQuery) -> list[dict[str, Any]]:
    """内置事件粗过滤: 类型与时间范围 (内存目录无 SQL 可用, 按同一口径筛)。

    5 条量级, 逐条解析时刻的开销可忽略; 不筛会让时间范围/类型过滤
    在内置这一源上失效 (历史事件永远挤在列表里)。"""
    out: list[dict[str, Any]] = []
    for rec in load_builtin():
        if qs.type is not None and rec["type"] != qs.type:
            continue
        jd = jd_from_iso(rec["dateUTC"])
        if qs.jd_from is not None and jd < qs.jd_from:
            continue
        if qs.jd_to is not None and jd >= qs.jd_to:
            continue
        out.append(rec)
    return out


async def catalog_counts(session: AsyncSession, now_jd: float) -> dict[str, int]:
    """页签角标计数: 全目录口径 (不受检索条件影响, 与历史前端行为一致)。

    只取时刻列做分类, 不物化整行, 数百条量级下开销可忽略。"""
    cad_jds = (await session.execute(select(CloseApproach.jd))).scalars().all()
    sim_jds = (await session.execute(select(SimEvent.jd))).scalars().all()
    counts = {"all": 0, "current": 0, "upcoming": 0, "past": 0, "sim": len(sim_jds)}
    for jd in chain(cad_jds, sim_jds, builtin_jds()):
        counts["all"] += 1
        counts[categorize(jd, now_jd)] += 1
    return counts


async def candidate_rows(session: AsyncSession, qs: EventQuery) -> list[EventRow]:
    """按来源汇聚候选行 (粗过滤后归一)。"""
    rows: list[EventRow] = []
    if qs.source in (None, "builtin"):
        rows += [builtin_row(rec, qs.now_jd) for rec in _builtin_candidates(qs)]
    if qs.source in (None, "sim"):
        rows += [sim_row(r, qs.now_jd) for r in await _fetch_sim(session, qs)]
    if qs.source in (None, "cad"):
        rows += [cad_row(r, qs.now_jd) for r in await _fetch_cad(session, qs)]
    return rows


async def query_events(session: AsyncSession, qs: EventQuery) -> dict[str, Any]:
    """事件列表: 过滤 → 统一排序 → 分页, 并附页签计数。

    size=0 表示只取计数 (顶栏角标等轻量消费方), 不返回条目。"""
    counts = await catalog_counts(session, qs.now_jd)
    rows = await candidate_rows(session, qs)
    rows = [r for r in rows if _match(r, qs)]
    rows.sort(key=_sort_key)
    total = len(rows)
    stats = summarize_rows(rows, qs.now_jd)
    if qs.size <= 0:
        return {
            "data": [], "total": total, "page": 1, "size": 0, "pages": 1,
            "counts": counts, "stats": stats, "nowJd": qs.now_jd,
        }
    pages = max(1, math.ceil(total / qs.size))
    page = min(max(1, qs.page), pages)
    start = (page - 1) * qs.size
    return {
        "data": [event_dto(r) for r in rows[start:start + qs.size]],
        "total": total,
        "page": page,
        "size": qs.size,
        "pages": pages,
        "counts": counts,
        "stats": stats,
        "nowJd": qs.now_jd,
    }


async def find_event(session: AsyncSession, key: str, now_jd: float) -> EventRow | None:
    """按路由键取单个事件 (r-<内置id> / c-<cdId> / s-<推演id>)。"""
    prefix, sep, ident = key.partition("-")
    if not sep or not ident:
        return None
    if prefix == "r":
        for rec in load_builtin():
            if rec["id"] == ident:
                return builtin_row(rec, now_jd)
        return None
    if prefix == "c":
        row = await session.get(CloseApproach, ident)
        return cad_row(row, now_jd) if row is not None else None
    if prefix == "s":
        row = await session.get(SimEvent, ident)
        return sim_row(row, now_jd) if row is not None else None
    return None
