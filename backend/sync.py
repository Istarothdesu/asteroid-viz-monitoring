"""定时同步任务: SBDB 命名列表 / CAD 接近事件 / MPCORB 云带抽样。"""

import asyncio
import logging

import httpx
from sqlalchemy import delete, func, select

from db import Asteroid, CloseApproach, CloudOrbit, SentryRisk, SessionLocal, SyncStatus, utcnow
from fetchers import fetch_cad, fetch_mpcorb, fetch_orbit_bundle, fetch_sbdb, fetch_sentry_summaries
from named_asteroids import CLOUD_QUOTA, NAMED
from bake_ephemeris import bake as _do_ephem
from bake_asteroid_ephemeris import bake_asteroids as _do_ephem_ast
from risk_service import upsert_assessment

log = logging.getLogger(__name__)

# 同一数据源并发触发保护
_running: set[str] = set()
_lock = asyncio.Lock()

TIMEOUT_DEFAULT = httpx.Timeout(connect=30.0, read=60.0, write=30.0, pool=30.0)
# MPC 服务器大文件下载很慢, 单独放宽
TIMEOUT_MPCORB = httpx.Timeout(connect=60.0, read=600.0, write=60.0, pool=60.0)


async def _set_status(source: str, status: str, count: int | None, message: str | None) -> None:
    async with SessionLocal() as session:
        row = await session.get(SyncStatus, source)
        if row is None:
            row = SyncStatus(source=source)
            session.add(row)
        row.status = status
        row.message = message
        if count is not None:
            row.record_count = count
        if status in ("ok", "error"):
            row.last_sync_at = utcnow()
        await session.commit()


async def _guarded(source: str, fn) -> bool:
    """串行守卫: 同源任务执行中则跳过。"""
    async with _lock:
        if source in _running:
            log.info("同步 %s 已在进行中, 跳过", source)
            return False
        _running.add(source)
    try:
        await _set_status(source, "running", None, None)
        count, msg = await fn()
        await _set_status(source, "ok", count, msg)
        log.info("同步 %s 完成: %d 条", source, count)
        return True
    except Exception as exc:  # noqa: BLE001 — 同步失败不应拖垮调度器
        log.exception("同步 %s 失败", source)
        await _set_status(source, "error", None, str(exc)[:500])
        return False
    finally:
        async with _lock:
            _running.discard(source)


async def _do_named() -> tuple[int, str]:
    ok, fail = 0, 0
    async with httpx.AsyncClient(timeout=TIMEOUT_DEFAULT) as client:
        for des, (name_zh, diam, spin_h, _cls) in NAMED.items():
            data, covariance = await fetch_orbit_bundle(client, des)
            if data is None:
                fail += 1
                continue
            async with SessionLocal() as session:
                row = await session.get(Asteroid, data["designation"])
                if row is None:
                    row = Asteroid(designation=data["designation"])
                    session.add(row)
                for k, v in data.items():
                    setattr(row, k, v)
                row.name_zh = name_zh
                row.diam_km = diam
                row.spin_h = spin_h
                row.updated_at = utcnow()
                if covariance is not None:
                    await upsert_assessment(session, covariance)
                await session.commit()
            ok += 1
            await asyncio.sleep(0.3)  # 对 JPL 接口保持温和
    return ok, f"成功 {ok}, 失败 {fail}"


async def _do_cad() -> tuple[int, str]:
    async with httpx.AsyncClient(timeout=TIMEOUT_DEFAULT) as client:
        events = await fetch_cad(client)
    async with SessionLocal() as session:
        await session.execute(delete(CloseApproach))
        session.add_all(CloseApproach(**ev) for ev in events)
        await session.commit()
    return len(events), f"date >= today, dist <= 20 LD"


async def _do_sentry() -> tuple[int, str]:
    """全量刷新 Sentry 当前对象汇总；只有完整抓取成功后才替换旧快照。"""
    async with httpx.AsyncClient(timeout=TIMEOUT_DEFAULT) as client:
        rows, version = await fetch_sentry_summaries(client)
    async with SessionLocal() as session:
        await session.execute(delete(SentryRisk))
        session.add_all(SentryRisk(**row) for row in rows)
        await session.commit()
    return len(rows), f"Sentry API v{version or '?'}"


async def _do_mpcorb() -> tuple[int, str]:
    async with httpx.AsyncClient(timeout=TIMEOUT_MPCORB, follow_redirects=True) as client:
        pools = await fetch_mpcorb(client, CLOUD_QUOTA)
    total = sum(len(v) for v in pools.values())
    async with SessionLocal() as session:
        await session.execute(delete(CloudOrbit))
        for pop, rows in pools.items():
            session.add_all(
                CloudOrbit(population=pop, **r) for r in rows
            )
            await session.flush()  # 分族提交, 控制单批内存
        await session.commit()
    return total, str({k: len(v) for k, v in pools.items()})


# refresh 任务就地更新的 SBDB 根数字段; designation/name_zh/diam_km/spin_h 不动
REFRESH_ORBIT_FIELDS = ("orbit_solution_id", "fullname", "a", "e", "i", "om", "w", "m0", "epoch_jd",
                        "period_d", "orbit_class", "neo", "pha", "moid_au")


async def _do_refresh() -> tuple[int, str]:
    """全量重刷 asteroids 表轨道根数 (出包前必跑, 仅数据工厂/有外网时可用)。

    named 任务只刷命名列表, 而 by-des 缓存的 CAD 天体长期不刷新会导致历元
    老化; 本任务对全表原地刷新, 保证出包时所有天体历元年龄一致且最新。
    """
    async with SessionLocal() as session:
        rows = (await session.execute(select(Asteroid))).scalars().all()
    total = len(rows)
    ok, fail = 0, 0
    async with httpx.AsyncClient(timeout=TIMEOUT_DEFAULT) as client:
        for n, row in enumerate(rows, 1):
            data = None
            for attempt in range(3):
                try:
                    data = await fetch_sbdb(client, row.designation)
                    break
                except httpx.HTTPError as exc:
                    log.warning("刷新请求异常(第%d次): %s %s",
                                attempt + 1, row.designation, exc)
                    await asyncio.sleep(2 * (attempt + 1))
            if data is None:
                fail += 1
                log.warning("刷新失败: %s", row.designation)
            else:
                async with SessionLocal() as session:
                    dbrow = await session.get(Asteroid, row.designation)
                    for k in REFRESH_ORBIT_FIELDS:
                        setattr(dbrow, k, data[k])
                    dbrow.updated_at = utcnow()
                    await session.commit()
                ok += 1
            if n % 50 == 0:
                log.info("刷新进度 %d/%d (成功 %d, 失败 %d)", n, total, ok, fail)
            await asyncio.sleep(0.3)  # 对 JPL 接口保持温和
    return ok, f"共 {total}, 成功 {ok}, 失败 {fail}"


JOBS = {
    "named": _do_named,
    "cad": _do_cad,
    "sentry": _do_sentry,
    "mpcorb": _do_mpcorb,
    # 全量根数刷新不属定时调度 (跑一次约 10 分钟), 出包前手动触发
    "refresh": _do_refresh,
    # 星历烘焙不属定时调度 (行星需 SPICE 内核/小行星需外网, 仅数据工厂), 仅手动触发
    "ephem": _do_ephem,
    "ephem_ast": _do_ephem_ast,
}


async def run_sync(source: str) -> bool:
    if source not in JOBS:
        raise ValueError(f"未知数据源: {source}")
    return await _guarded(source, JOBS[source])


async def bootstrap_if_empty() -> None:
    """表为空时启动即补 (首次运行/清空数据库后)。"""
    async with SessionLocal() as session:
        counts = {
            name: (await session.execute(select(func.count()).select_from(t))).scalar_one()
            for name, t in (
                ("named", Asteroid),
                ("cad", CloseApproach),
                ("sentry", SentryRisk),
                ("mpcorb", CloudOrbit),
            )
        }
    # MPCORB 下载慢, 不阻塞另两项
    if counts["named"] == 0:
        await run_sync("named")
    if counts["cad"] == 0:
        await run_sync("cad")
    if counts["sentry"] == 0:
        asyncio.create_task(run_sync("sentry"))
    if counts["mpcorb"] == 0:
        asyncio.create_task(run_sync("mpcorb"))
