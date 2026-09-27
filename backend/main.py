import asyncio
import logging
import os
import struct
import uuid
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Literal

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

import events_service as E
from event_analysis.routes import router as event_analysis_router
from l1.routes import router as l1_router
from terrain_routes import router as terrain_router
from db import (
    Asteroid,
    AsteroidEphemeris,
    CloseApproach,
    CloudOrbit,
    PlanetEphemeris,
    RiskAssessment,
    SessionLocal,
    SentryRisk,
    SimEvent,
    SyncStatus,
    init_db,
    utcnow,
)
from fetchers import fetch_orbit_bundle
from named_asteroids import NAMED
from risk_service import (
    assessment_has_usable_covariance,
    assessment_dto,
    resolve_assessment,
    sentry_dto,
    upsert_assessment,
)
from settings import SYNC_ENABLED
from sync import TIMEOUT_DEFAULT, bootstrap_if_empty, run_sync

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def _static_dir() -> Path | None:
    """前端产物目录 (vite build 输出); 不存在时只提供 API (纯后端开发)。"""
    p = Path(os.getenv("FRONTEND_DIST", "static"))
    if not p.is_absolute():
        p = Path(__file__).resolve().parent / p
    return p if (p / "index.html").is_file() else None


STATIC_DIR = _static_dir()


def asteroid_dto(row: Asteroid) -> dict:
    """序列化为前端 AsteroidRecord 形状 (与 data/asteroids.ts 字段对齐)。"""
    zh, diam_default, spin_default, cls_default = NAMED.get(
        row.designation, (row.designation, 1.0, 6.0, row.orbit_class or "未知")
    )
    return {
        "name": row.name_zh or zh,
        "en": row.fullname or row.designation,
        "des": row.designation,
        "orbitSolutionId": row.orbit_solution_id,
        "a": row.a, "e": row.e, "i": row.i,
        "O": row.om, "w": row.w, "M0": row.m0,
        "epochJd": row.epoch_jd,
        "diam": row.diam_km if row.diam_km is not None else diam_default,
        "cls": cls_default,
        "spinH": row.spin_h if row.spin_h is not None else spin_default,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    scheduler: AsyncIOScheduler | None = None
    if SYNC_ENABLED:
        scheduler = AsyncIOScheduler()
        scheduler.add_job(run_sync, CronTrigger(hour=3), args=["named"], id="sync_named")
        scheduler.add_job(run_sync, IntervalTrigger(hours=6), args=["cad"], id="sync_cad")
        scheduler.add_job(run_sync, IntervalTrigger(hours=12), args=["sentry"], id="sync_sentry")
        scheduler.add_job(run_sync, CronTrigger(day_of_week="sun", hour=4), args=["mpcorb"], id="sync_mpcorb")
        scheduler.start()
        asyncio.create_task(bootstrap_if_empty())
    else:
        log.warning(
            "SYNC_ENABLED=false: 跳过定时同步与首启补数 (离线内网口径), "
            "数据以镜像内置/挂载的 SQLite 为准"
        )
    yield
    if scheduler is not None:
        scheduler.shutdown(wait=False)


app = FastAPI(title="sta-intra API", version="0.2.0", lifespan=lifespan)
app.include_router(l1_router)
app.include_router(event_analysis_router)
app.include_router(terrain_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 纯读接口, 无凭据
    allow_methods=["*"],
    allow_headers=["*"],
)
# 星历二进制包 ~20MB, gzip 后可压缩约一半; 小响应不值得压缩, 阈值 1MB
app.add_middleware(GZipMiddleware, minimum_size=1 << 20)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/asteroids")
async def get_asteroids():
    """命名列表轨道根数。按 NAMED 球表顺序返回, 保证前端索引稳定。"""
    async with SessionLocal() as session:
        rows = (await session.execute(select(Asteroid))).scalars().all()
    by_des = {r.designation: r for r in rows}
    ordered = [by_des[des] for des in NAMED if des in by_des]
    return {"data": [asteroid_dto(r) for r in ordered], "source": "db"}


@app.get("/api/asteroids/by-des/{des}")
async def get_asteroid_by_des(des: str):
    """库中有直接返回; 没有则现取 SBDB 并缓存入库。"""
    async with SessionLocal() as session:
        row = await session.get(Asteroid, des)
    if row is not None:
        return asteroid_dto(row)
    if not SYNC_ENABLED:
        # 离线部署不联网现查: 立即 404, 避免前端白等 20s 超时
        raise HTTPException(status_code=404, detail=f"离线部署未缓存该天体: {des}")
    async with httpx.AsyncClient(timeout=TIMEOUT_DEFAULT) as client:
        data, covariance = await fetch_orbit_bundle(client, des)
    if data is None:
        raise HTTPException(status_code=404, detail=f"SBDB 无此天体: {des}")
    zh, diam, spin_h, _ = NAMED.get(des, (None, None, None, None))
    async with SessionLocal() as session:
        row = Asteroid(**data)  # data 已含 designation
        row.name_zh = zh
        row.diam_km = diam
        row.spin_h = spin_h
        await session.merge(row)
        if covariance is not None:
            await upsert_assessment(session, covariance)
        await session.commit()
    return asteroid_dto(row)


@app.get("/api/cloud")
async def get_cloud():
    """云带抽样样本, 按族群分组: [a, e, i, Ω, ω, M0(J2000), H, 可读编号?]。"""
    async with SessionLocal() as session:
        rows = (await session.execute(select(CloudOrbit))).scalars().all()
    out: dict[str, list[list]] = {}
    for r in rows:
        row: list = [r.a, r.e, r.i, r.om, r.w, r.m0, r.mag_h or 0.0]
        if r.designation:
            row.append(r.designation)
        out.setdefault(r.population, []).append(row)
    return {"data": out, "source": "db"}


# ---------------------------------------------------------------------------
# 概率风险数据: 当前只读暴露权威 Sentry 汇总与 SBDB 协方差快照。
# B 平面、样本传播和走廊在后续阶段基于同一快照生成，缺数据时显式降级。
# ---------------------------------------------------------------------------

@app.get("/api/risk/{designation}")
async def get_risk(
    designation: str,
    orbit_solution_id: str | None = Query(default=None, alias="orbitSolutionId"),
):
    async with SessionLocal() as session:
        assessment = await resolve_assessment(session, designation, orbit_solution_id)
        sentry = await session.get(SentryRisk, designation)
        asteroid = await session.get(Asteroid, designation)
    version_match = (
        orbit_solution_id is None
        or (assessment is not None and assessment.orbit_solution_id == orbit_solution_id)
    )
    orbit_version_match = (
        orbit_solution_id is None
        or (asteroid is not None and asteroid.orbit_solution_id == orbit_solution_id)
    )
    usable_covariance = assessment_has_usable_covariance(assessment)
    return {
        "designation": designation,
        "assessment": assessment_dto(assessment),
        "sentry": sentry_dto(sentry),
        "requestedOrbitSolutionId": orbit_solution_id,
        "orbitSolutionMatch": version_match and orbit_version_match,
        "availability": {
            "uncertainty": usable_covariance,
            "bPlane": asteroid is not None,
            "impactCorridor": False,
        },
    }


class RiskAssessIn(BaseModel):
    """受控数据工厂按需刷新单目标协方差快照。"""

    designation: str = Field(min_length=1, max_length=32)


@app.post("/api/risk/assess", status_code=202)
async def refresh_risk_assessment(payload: RiskAssessIn):
    if not SYNC_ENABLED:
        raise HTTPException(status_code=409, detail="离线部署不执行联网风险数据刷新")
    async with httpx.AsyncClient(timeout=TIMEOUT_DEFAULT) as client:
        orbit, covariance = await fetch_orbit_bundle(client, payload.designation)
    if orbit is None:
        raise HTTPException(status_code=404, detail=f"SBDB 无轨道根数: {payload.designation}")
    row = None
    async with SessionLocal() as session:
        asteroid = await session.get(Asteroid, orbit["designation"])
        if asteroid is None:
            asteroid = Asteroid(designation=orbit["designation"])
            session.add(asteroid)
        for key, value in orbit.items():
            setattr(asteroid, key, value)
        zh, diam, spin_h, cls = NAMED.get(orbit["designation"], (None, None, None, None))
        if zh is not None:
            asteroid.name_zh = zh
        if diam is not None:
            asteroid.diam_km = diam
        if spin_h is not None:
            asteroid.spin_h = spin_h
        if cls is not None and not asteroid.orbit_class:
            asteroid.orbit_class = cls
        asteroid.updated_at = utcnow()
        if covariance is not None:
            row = await upsert_assessment(session, covariance)
        await session.commit()
    if covariance is None:
        # 即使目标没有协方差，也已把与 CAD 解编号对应的最新名义根数写入本地。
        raise HTTPException(status_code=404, detail=f"SBDB 无可用协方差: {payload.designation}")
    return {"assessment": assessment_dto(row)}


@app.get("/api/events/close-approaches")
async def get_close_approaches():
    """CAD 接近事件原始转储 (不分页)。

    前端事件中心已改走 /api/events 服务端分页; 本接口保留给运维脚本
    (deploy/prewarm_cache.py 靠它枚举待预热的 SBDB 天体)。"""
    async with SessionLocal() as session:
        rows = (await session.execute(
            select(CloseApproach).order_by(CloseApproach.jd)
        )).scalars().all()
    return {
        "data": [
            {
                "cdId": r.cd_id,
                "des": r.designation,
                "fullname": r.fullname,
                "dateIso": r.date_iso,
                "jd": r.jd,
                "distLd": r.dist_ld,
                "distMinLd": r.dist_min_ld,
                "distMaxLd": r.dist_max_ld,
                "vRelKms": r.v_rel_kms,
                "h": r.h_mag,
                "diamKm": r.diam_km,
            }
            for r in rows
        ],
        "source": "db",
    }


@app.get("/api/ephemeris")
async def get_ephemeris():
    """行星/月球 + 重点小行星预计算星历 (烘焙表), 二进制小端流, 前端 Hermite 插值消费。

    线格式:
      uint16 version(=1), uint16 天体数
      每天体: uint8 名称长度, 名称 utf8 (行星小写英文名如 "earth";
              小行星为 SBDB designation 如 "1" / "2020 QW3"),
              float64 jd0 (网格起点, UTC JD), float64 step_d, uint32 count,
              count * float64 xyz 位置 (AU), count * float32 xyz 速度 (AU/day)
      第 k 点对应 jd = jd0 + k * step_d; 行星与小行星为日心黄道 (ECLIPJ2000),
      月球为地心相对坐标。两张表均为空 (未烘焙) 返回 404, 前端回退简化根数表。
    """
    async with SessionLocal() as session:
        rows = (await session.execute(
            select(PlanetEphemeris).order_by(PlanetEphemeris.body)
        )).scalars().all()
        ast_rows = (await session.execute(
            select(AsteroidEphemeris).order_by(AsteroidEphemeris.designation)
        )).scalars().all()
    if not rows and not ast_rows:
        raise HTTPException(status_code=404, detail="星历未烘焙, 请先运行 bake_ephemeris.py")
    buf = bytearray(struct.pack("<HH", 1, len(rows) + len(ast_rows)))
    for r in (*rows, *ast_rows):
        name = (r.body if isinstance(r, PlanetEphemeris) else r.designation).encode()
        buf += struct.pack("<B", len(name)) + name
        buf += struct.pack("<ddI", r.jd0, r.step_d, r.count)
        buf += r.pos
        buf += r.vel
    return Response(
        content=bytes(buf),
        media_type="application/octet-stream",
        # 内容随数据包换库可能变化而 URL 不变, no-cache 保证导入新包后前端取到新值
        headers={"Cache-Control": "no-cache"},
    )


# ---------------------------------------------------------------------------
# 事件中心: 三源汇聚的服务端分页目录
#
# 内置经典 (镜像内 JSON) / JPL CAD (close_approaches) / 用户推演 (sim_events)
# 在服务端归一为同一 EventItem 形状, 过滤·排序·分页·页签计数全部下推,
# 前端不再一次性拉取全量。now_jd 是显式分析基准，默认真实当前时刻；
# 选择推演基准时由前端传入快照，时间轴拖动不会隐式改变目录。
# ---------------------------------------------------------------------------

@app.get("/api/events")
async def list_events(
    page: int = Query(1, ge=1, description="页码 (1 起)"),
    size: int = Query(10, ge=0, le=200, description="每页条数; 0 = 只取计数"),
    q: str | None = Query(None, max_length=64, description="关键字: 事件名称/风险目标"),
    event_type: Literal["impact", "flyby"] | None = Query(None, alias="type"),
    source: Literal["builtin", "cad", "sim"] | None = Query(None),
    severity: Literal["critical", "high", "medium", "low"] | None = Query(None),
    category: Literal["current", "upcoming", "past"] | None = Query(None),
    date_from: date | None = Query(None, description="发生时刻起 (UTC 日期, 含)"),
    date_to: date | None = Query(None, description="发生时刻止 (UTC 日期, 含整天)"),
    now_jd: float | None = Query(None, description="时序分类与统计的分析基准 JD"),
):
    """事件列表: 组合检索 + 服务端分页, 附页签计数。"""
    jd_from = E.jd_from_date(date_from) if date_from is not None else None
    jd_to = E.jd_from_date(date_to, end_of_day=True) if date_to is not None else None
    if jd_from is not None and jd_to is not None and jd_from >= jd_to:
        raise HTTPException(status_code=422, detail="时间范围起点晚于终点")
    qs = E.EventQuery(
        now_jd=E.now_jd_utc() if now_jd is None else now_jd,
        page=page,
        size=size,
        q=q.strip() if q and q.strip() else None,
        type=event_type,
        source=source,
        severity=severity,
        category=category,
        jd_from=jd_from,
        jd_to=jd_to,
    )
    async with SessionLocal() as session:
        return await E.query_events(session, qs)


@app.get("/api/events/builtin")
async def get_builtin_events():
    """内置经典事件的完整记录 (含轨道根数/图片/背景资料)。

    仅 5 条量级, 不分页: 前端一次取回作为复盘/预览目录。
    必须先于 /api/events/{key} 注册, 否则会被路由参数吞掉。"""
    return {
        "data": [E.builtin_record(r) for r in E.load_builtin()],
        "source": "builtin",
    }


@app.get("/api/events/{key}")
async def get_event(key: str, now_jd: float | None = Query(None)):
    """单个事件详情: 列表 DTO + 可复盘的完整 record。

    键格式 r-<内置id> / c-<cdId> / s-<推演id> (与前端路由同源)。"""
    njd = E.now_jd_utc() if now_jd is None else now_jd
    async with SessionLocal() as session:
        row = await E.find_event(session, key, njd)
    if row is None:
        raise HTTPException(status_code=404, detail=f"未找到事件: {key}")
    return E.event_dto(row, include_record=True)


# ---------------------------------------------------------------------------
# 用户推演事件 CRUD (原 localStorage 草稿, 入库后跨浏览器共享)
# ---------------------------------------------------------------------------

class OrbitElIn(BaseModel):
    """轨道根数 (不含平近点角: 拟合时由遭遇几何反解)。"""

    a: float = Field(gt=0)
    e: float = Field(ge=0, lt=1)
    i: float
    O: float
    w: float


class SimEventIn(BaseModel):
    """推演事件写入载荷 (字段名与前端 SimEvent 一致, diam 单位米)。"""

    name: str = Field(min_length=1, max_length=128)
    desc: str = ""
    type: Literal["impact", "flyby"] = "flyby"
    targetType: str = Field(default="未知", max_length=32)
    diam: float = Field(gt=0)
    dateUTC: str
    el: OrbitElIn
    missKm: float | None = Field(default=None, ge=0)
    impactLat: float | None = Field(default=None, ge=-90, le=90)
    impactLon: float | None = Field(default=None, ge=-180, le=180)
    burstAltKm: float | None = Field(default=None, ge=0)
    shockAreaKm2: float | None = Field(default=None, ge=0)
    energyMt: float | None = Field(default=None, ge=0)
    leadH: float = Field(gt=0)

    @field_validator("dateUTC")
    @classmethod
    def _check_date(cls, v: str) -> str:
        try:
            E.jd_from_iso(v)
        except ValueError as exc:
            raise ValueError(
                "遭遇时间需为 ISO8601, 如 2029-04-13T21:46:00Z"
            ) from exc
        return v


@app.get("/api/sim-events")
async def list_sim_events():
    async with SessionLocal() as session:
        rows = (await session.execute(
            select(SimEvent).order_by(SimEvent.jd)
        )).scalars().all()
    return {"data": [E.sim_dto(r) for r in rows], "source": "db"}


@app.post("/api/sim-events", status_code=201)
async def create_sim_event(payload: SimEventIn):
    row = SimEvent(id=uuid.uuid4().hex, **E.sim_columns(payload.model_dump()))
    async with SessionLocal() as session:
        session.add(row)
        await session.commit()
    log.info("新建推演事件: %s (%s)", row.name, row.id)
    return E.sim_dto(row)


@app.put("/api/sim-events/{sim_id}")
async def update_sim_event(sim_id: str, payload: SimEventIn):
    async with SessionLocal() as session:
        row = await session.get(SimEvent, sim_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"未找到推演事件: {sim_id}")
        for col, val in E.sim_columns(payload.model_dump()).items():
            setattr(row, col, val)
        row.updated_at = utcnow()
        await session.commit()
    return E.sim_dto(row)


@app.delete("/api/sim-events/{sim_id}")
async def delete_sim_event(sim_id: str):
    async with SessionLocal() as session:
        row = await session.get(SimEvent, sim_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"未找到推演事件: {sim_id}")
        await session.delete(row)
        await session.commit()
    return {"ok": True, "id": sim_id}


@app.post("/api/sync/{source}")
async def trigger_sync(source: str, background: BackgroundTasks):
    if source not in ("named", "cad", "sentry", "mpcorb", "refresh", "ephem", "ephem_ast"):
        raise HTTPException(status_code=404, detail=f"未知数据源: {source}")
    if not SYNC_ENABLED:
        # 离线内网无出口: 手动触发也只会换来一长时间超时后的失败记录
        raise HTTPException(status_code=409, detail="SYNC_ENABLED=false, 当前部署不执行联网同步")
    background.add_task(run_sync, source)
    return {"source": source, "scheduled": True}


@app.get("/api/sync/status")
async def sync_status():
    async with SessionLocal() as session:
        rows = (await session.execute(select(SyncStatus))).scalars().all()
    return {
        r.source: {
            "lastSyncAt": r.last_sync_at.isoformat() if r.last_sync_at else None,
            "recordCount": r.record_count,
            "status": r.status,
            "message": r.message,
        }
        for r in rows
    }


# ---------------------------------------------------------------------------
# 前端静态资源 (单镜像同源部署)
#
# 与 API 同进程提供, 前端因此可以走同源相对路径 /api: 镜像不需要在构建期
# 知道后端地址, 内网换 IP/端口/域名都不用重新构建。必须在全部 API 路由之后
# 注册: catch-all 会吃掉其他未匹配路径。
# ---------------------------------------------------------------------------
if STATIC_DIR is not None:
    static_root = STATIC_DIR.resolve()
    assets_dir = static_root / "assets"
    if assets_dir.is_dir():
        # vite 产物文件名带内容 hash, 可安全长缓存
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # GET + HEAD: 只用 @app.get 会让 HEAD 请求落到 405 (探活/预热类工具常用 HEAD)
    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def spa(path: str):
        """SPA history fallback: 命中真实静态文件则直出, 其余路径回 index.html。

        前端用 BrowserRouter, /events/:key 这类深链接在服务端并无对应文件,
        刷新时必须回落 index.html 交给前端路由; 未命中的 /api 路径仍按 404 返回
        JSON, 避免把 HTML 当接口响应交给调用方。
        """
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail=f"未知接口: /{path}")
        index = static_root / "index.html"
        if not path:
            return FileResponse(index)
        candidate = (static_root / path).resolve()
        # is_relative_to 防路径穿越 (../ 类请求)
        if candidate.is_file() and candidate.is_relative_to(static_root):
            return FileResponse(candidate)
        return FileResponse(index)

    log.info("已挂载前端产物: %s", static_root)
else:
    log.info(
        "未找到前端产物 (FRONTEND_DIST=%s), 本次仅提供 API",
        os.getenv("FRONTEND_DIST", "static"),
    )
