"""异步数据库引擎与 ORM 模型。

DATABASE_URL 未设置时默认本地 SQLite (零依赖开发/内网单机部署),
设置时使用 Postgres。SQLite 文件目录由 DATA_DIR 指定 (容器部署时指向
挂载的 volume, 保证重启不丢同步结果), 未设置时落在进程当前目录。
"""

import os
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, LargeBinary, String, Text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _sqlite_url() -> str:
    data_dir = os.getenv("DATA_DIR")
    filename = os.path.join(data_dir, "sta_intra.db") if data_dir else "sta_intra.db"
    return f"sqlite+aiosqlite:///{filename}"


DATABASE_URL = os.getenv("DATABASE_URL") or _sqlite_url()

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    # SQLite 单文件不支持连接池并发写, Postgres 下无影响
    pool_pre_ping=True,
)

SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Asteroid(Base):
    """命名小行星的真实轨道根数 (来源 JPL SBDB)。

    m0 统一归一化为 J2000 历元的平近点角 (度), epoch_jd 保留原始历元。
    """

    __tablename__ = "asteroids"

    designation: Mapped[str] = mapped_column(String(32), primary_key=True)
    orbit_solution_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    fullname: Mapped[str | None] = mapped_column(String(128), nullable=True)
    name_zh: Mapped[str | None] = mapped_column(String(32), nullable=True)
    a: Mapped[float] = mapped_column(Float)
    e: Mapped[float] = mapped_column(Float)
    i: Mapped[float] = mapped_column(Float)
    om: Mapped[float] = mapped_column(Float)
    w: Mapped[float] = mapped_column(Float)
    m0: Mapped[float] = mapped_column(Float)
    epoch_jd: Mapped[float] = mapped_column(Float)
    period_d: Mapped[float | None] = mapped_column(Float, nullable=True)
    orbit_class: Mapped[str | None] = mapped_column(String(64), nullable=True)
    neo: Mapped[bool] = mapped_column(Boolean, default=False)
    pha: Mapped[bool] = mapped_column(Boolean, default=False)
    moid_au: Mapped[float | None] = mapped_column(Float, nullable=True)
    diam_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    spin_h: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CloudOrbit(Base):
    """MPCORB 分层抽样样本, 供前端程序化小行星云使用。

    designation 为 MPCORB 可读编号 (如 '(1) Ceres' / '2014 KP4'),
    支撑前端拾取后的身份展示与 SBDB 按需补全。"""

    __tablename__ = "cloud_orbits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    population: Mapped[str] = mapped_column(String(16), index=True)
    designation: Mapped[str | None] = mapped_column(String(32), nullable=True)
    a: Mapped[float] = mapped_column(Float)
    e: Mapped[float] = mapped_column(Float)
    i: Mapped[float] = mapped_column(Float)
    om: Mapped[float] = mapped_column(Float)
    w: Mapped[float] = mapped_column(Float)
    m0: Mapped[float] = mapped_column(Float)
    epoch_jd: Mapped[float] = mapped_column(Float)
    mag_h: Mapped[float | None] = mapped_column(Float, nullable=True)


class CloseApproach(Base):
    """未来近地小行星接近事件 (来源 JPL CAD)。"""

    __tablename__ = "close_approaches"

    cd_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    designation: Mapped[str] = mapped_column(String(32), index=True)
    fullname: Mapped[str | None] = mapped_column(String(128), nullable=True)
    date_iso: Mapped[str] = mapped_column(String(32))
    # 事件中心按时间范围分页检索, jd 建索引 (存量库由 _ensure_indexes 补)
    jd: Mapped[float] = mapped_column(Float, index=True)
    dist_ld: Mapped[float] = mapped_column(Float)
    dist_min_ld: Mapped[float | None] = mapped_column(Float, nullable=True)
    dist_max_ld: Mapped[float | None] = mapped_column(Float, nullable=True)
    v_rel_kms: Mapped[float | None] = mapped_column(Float, nullable=True)
    h_mag: Mapped[float | None] = mapped_column(Float, nullable=True)
    diam_km: Mapped[float | None] = mapped_column(Float, nullable=True)


class SimEvent(Base):
    """用户推演 (仿真) 事件: 事件中心第三源, 可复盘。

    原为前端 localStorage 草稿, 迁入服务端后跨浏览器共享且不随清缓存丢失。
    jd 由 date_utc 在写入时换算并落列, 供时间范围过滤与统一排序使用。
    直径以米存储 (前端表单口径), 序列化回 EventRecord 时换算为 km。
    """

    __tablename__ = "sim_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(128))
    desc: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[str] = mapped_column(String(8), default="flyby")
    target_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    diam_m: Mapped[float] = mapped_column(Float)
    date_utc: Mapped[str] = mapped_column(String(32))
    jd: Mapped[float] = mapped_column(Float, index=True)
    a: Mapped[float] = mapped_column(Float)
    e: Mapped[float] = mapped_column(Float)
    i: Mapped[float] = mapped_column(Float)
    om: Mapped[float] = mapped_column(Float)
    w: Mapped[float] = mapped_column(Float)
    miss_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    impact_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    impact_lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    burst_alt_km: Mapped[float | None] = mapped_column(Float, nullable=True)
    shock_area_km2: Mapped[float | None] = mapped_column(Float, nullable=True)
    energy_mt: Mapped[float | None] = mapped_column(Float, nullable=True)
    lead_h: Mapped[float] = mapped_column(Float, default=8.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PlanetEphemeris(Base):
    """行星/月球预计算星历 (数据工厂由 SPICE de440s 烘焙, 见 bake_ephemeris.py)。

    每天体一行, 采样序列以 blob 存储:
    - pos: float64 小端 xyz 交错排列, 单位 AU, J2000 日心黄道坐标
      (月球为地心相对坐标);
    - vel: float32 小端 xyz 交错排列, 单位 AU/day (Hermite 插值用);
    - 第 k 个采样点对应 jd = jd0 + k * step_d (UTC 儒略日网格)。
    """

    __tablename__ = "planet_ephemeris"

    body: Mapped[str] = mapped_column(String(16), primary_key=True)
    jd0: Mapped[float] = mapped_column(Float)
    step_d: Mapped[float] = mapped_column(Float)
    count: Mapped[int] = mapped_column(Integer)
    pos: Mapped[bytes] = mapped_column(LargeBinary)
    vel: Mapped[bytes] = mapped_column(LargeBinary)
    baked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AsteroidEphemeris(Base):
    """重点小行星 (PHA + 命名清单) 预计算星历 (数据工厂由 JPL Horizons 烘焙,
    见 bake_asteroid_ephemeris.py)。

    schema 与 planet_ephemeris 相同, 主键为 SBDB designation; 坐标为
    J2000 日心黄道 (ECLIPJ2000)。开普勒二体传播随 |t - 历元| 发散,
    重点天体的观测预报与事件复盘需要全摄动精度, 故离线烘焙成表。"""

    __tablename__ = "asteroid_ephemeris"

    designation: Mapped[str] = mapped_column(String(32), primary_key=True)
    orbit_solution_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    jd0: Mapped[float] = mapped_column(Float)
    step_d: Mapped[float] = mapped_column(Float)
    count: Mapped[int] = mapped_column(Integer)
    pos: Mapped[bytes] = mapped_column(LargeBinary)
    vel: Mapped[bytes] = mapped_column(LargeBinary)
    baked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RiskAssessment(Base):
    """一份可追溯的 SBDB 轨道协方差快照。

    协方差只在其解历元有效，故快照键包含目标、轨道解编号和协方差历元。
    当前阶段保存 JPL 原始参数空间的矩阵，后续样本传播再转换为笛卡尔协方差。
    """

    __tablename__ = "risk_assessments"

    assessment_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    designation: Mapped[str] = mapped_column(String(32), index=True)
    orbit_solution_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    solution_epoch_tdb: Mapped[float | None] = mapped_column(Float, nullable=True)
    covariance_epoch_tdb: Mapped[float] = mapped_column(Float)
    covariance_labels_json: Mapped[str] = mapped_column(Text)
    covariance_data_json: Mapped[str] = mapped_column(Text)
    # covariance.elements 的中心值；与 labels/data 同一 SBDB 解，用于后续样本传播。
    covariance_elements_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SentryRisk(Base):
    """JPL Sentry 对单个目标的当前官方风险汇总。"""

    __tablename__ = "sentry_risks"

    designation: Mapped[str] = mapped_column(String(32), primary_key=True)
    fullname: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sentry_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    impact_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    virtual_impactor_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    palermo_cum: Mapped[float | None] = mapped_column(Float, nullable=True)
    palermo_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    torino_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    vinf_kms: Mapped[float | None] = mapped_column(Float, nullable=True)
    impact_range: Mapped[str | None] = mapped_column(String(32), nullable=True)
    last_obs: Mapped[str | None] = mapped_column(String(16), nullable=True)
    source_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SyncStatus(Base):
    """各数据源最近一次同步状态。"""

    __tablename__ = "sync_status"

    source: Mapped[str] = mapped_column(String(16), primary_key=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(16), default="idle")
    message: Mapped[str | None] = mapped_column(String(512), nullable=True)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_cloud_designation)
        await conn.run_sync(_ensure_asteroid_orbit_solution_id)
        await conn.run_sync(_ensure_asteroid_ephemeris_solution_id)
        await conn.run_sync(_ensure_risk_assessment_fields)
        await conn.run_sync(_ensure_indexes)


def _ensure_indexes(conn) -> None:
    """存量库迁移: create_all 不会给已存在的表补索引, 旧库缺 jd 索引时手动补。

    事件中心改为服务端按时间范围分页后, close_approaches.jd 为热查询列。"""
    from sqlalchemy import text

    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_close_approaches_jd ON close_approaches (jd)"
    ))


def _ensure_cloud_designation(conn) -> None:
    """存量库迁移: create_all 不会给已存在的表补列, 旧库缺 designation 时手动补。"""
    from sqlalchemy import inspect, text

    insp = inspect(conn)
    cols = {c["name"] for c in insp.get_columns("cloud_orbits")}
    if "designation" not in cols:
        conn.execute(text(
            "ALTER TABLE cloud_orbits ADD COLUMN designation VARCHAR(32)"
        ))


def _ensure_asteroid_orbit_solution_id(conn) -> None:
    """存量根数补充 SBDB 轨道解编号，供 CAD/协方差版本一致性校验。"""
    from sqlalchemy import inspect, text

    insp = inspect(conn)
    cols = {c["name"] for c in insp.get_columns("asteroids")}
    if "orbit_solution_id" not in cols:
        conn.execute(text(
            "ALTER TABLE asteroids ADD COLUMN orbit_solution_id VARCHAR(32)"
        ))


def _ensure_asteroid_ephemeris_solution_id(conn) -> None:
    """为烘焙星历补充来源轨道解；无法可靠追溯的旧行保持为空。"""
    from sqlalchemy import inspect, text

    insp = inspect(conn)
    if "asteroid_ephemeris" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("asteroid_ephemeris")}
    if "orbit_solution_id" not in cols:
        conn.execute(text(
            "ALTER TABLE asteroid_ephemeris ADD COLUMN orbit_solution_id VARCHAR(32)"
        ))
        # 根数快照早于星历烘焙时，才可把该版本视为烘焙输入；根数后来更新的
        # 行保持 NULL，传播时回退到有明确版本的根数。
        conn.execute(text("""
            UPDATE asteroid_ephemeris
            SET orbit_solution_id = (
                SELECT a.orbit_solution_id FROM asteroids a
                WHERE a.designation = asteroid_ephemeris.designation
                  AND a.updated_at <= asteroid_ephemeris.baked_at
            )
        """))


def _ensure_risk_assessment_fields(conn) -> None:
    """存量风险快照补充协方差中心值，保留既有 SQLite 数据。"""
    from sqlalchemy import inspect, text

    insp = inspect(conn)
    if "risk_assessments" not in insp.get_table_names():
        return
    cols = {c["name"] for c in insp.get_columns("risk_assessments")}
    if "covariance_elements_json" not in cols:
        conn.execute(text(
            "ALTER TABLE risk_assessments ADD COLUMN covariance_elements_json TEXT"
        ))
