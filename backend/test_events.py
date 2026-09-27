"""events_service 派生规则与分页查询单元测试 (不依赖网络)。

覆盖三层:
 · 换算与分档 —— 儒略日/直径估算/能量估算/危险等级/时序分类, 与前端 TS 口径逐条对齐;
 · 行归一     —— 三源 (builtin/cad/sim) 到统一 EventRow 的字段落实与缺省补齐;
 · 查询编排   —— 过滤·排序·分页·计数, 以及路由层的日期区间换算与校验。

数据库用例统一落在 tmp_path 下的临时 SQLite 文件上, 并用 NullPool 保证
「每次取用即新建连接」, 避免连接跨事件循环复用。
"""

import asyncio
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

import events_service as E
import main
from db import Base, CloseApproach, SimEvent

# 固定的时序分类基准 (前端仿真时钟 JD): 2026-09-07 00:00 UTC
NOW_JD = E.jd_from_iso("2026-09-07T00:00:00Z")


# ---------------------------------------------------------------------------
# fixture 构造
# ---------------------------------------------------------------------------

def _cad(cd_id, designation, date_iso, dist_ld, diam_km=None, h_mag=None,
         v_rel_kms=5.0, fullname=None) -> CloseApproach:
    """CAD 行: date_iso 无尾缀 Z (与 sync.py 入库口径一致), jd 由服务端换算。"""
    return CloseApproach(
        cd_id=cd_id,
        designation=designation,
        fullname=fullname,
        date_iso=date_iso,
        jd=E.jd_from_iso(f"{date_iso}Z"),
        dist_ld=dist_ld,
        v_rel_kms=v_rel_kms,
        h_mag=h_mag,
        diam_km=diam_km,
    )


def _sim(sim_id, name, date_utc, type_="flyby", diam_m=100.0, miss_km=None,
         desc=None, **extra) -> SimEvent:
    return SimEvent(
        id=sim_id,
        name=name,
        desc=desc,
        type=type_,
        target_type="未知",
        diam_m=diam_m,
        date_utc=date_utc,
        jd=E.jd_from_iso(date_utc),
        a=1.2, e=0.3, i=5.0, om=10.0, w=20.0,
        miss_km=miss_km,
        lead_h=8.0,
        **extra,
    )


# 4 条 CAD + 3 条推演, 叠加 5 条内置经典 = 12 条全目录
CAD_SPECS = [
    dict(cd_id="1001", designation="2026 A1", date_iso="2026-09-20T00:00:00",
         dist_ld=1.5, diam_km=0.2, v_rel_kms=6.1),
    dict(cd_id="1002", designation="2026 B2", date_iso="2026-10-05T12:00:00",
         dist_ld=0.1, diam_km=0.05, v_rel_kms=12.4),
    dict(cd_id="1003", designation="2027 C3", date_iso="2027-12-01T06:30:00",
         dist_ld=5.0, h_mag=22.0),
    dict(cd_id="1004", designation="2020 D4", date_iso="2020-01-15T00:00:00",
         dist_ld=8.0, v_rel_kms=None, fullname="(2020 D4)"),
]

SIM_SPECS = [
    dict(sim_id="sim01", name="推演飞掠 Alpha", date_utc="2026-09-10T00:00:00Z",
         type_="flyby", diam_m=120.0, miss_km=90000.0),
    dict(sim_id="sim02", name="推演撞击 Beta", date_utc="2028-03-01T00:00:00Z",
         type_="impact", diam_m=50.0, impact_lat=30.0, impact_lon=120.0,
         burst_alt_km=15.0),
    dict(sim_id="sim03", name="历史推演 Gamma", date_utc="2015-06-01T00:00:00Z",
         type_="impact", diam_m=20.0, energy_mt=0.05, desc="已归档的推演"),
]

# 仅供纯函数用例直接取用; 入库用例一律由 _seed 重新构造 ——
# 同一 ORM 实例被第二个 session 复用会退化成 UPDATE (空库 0 行命中, 静默丢数据)。
CAD_ROWS = [_cad(**s) for s in CAD_SPECS]
SIM_ROWS = [_sim(**s) for s in SIM_SPECS]

# 全目录在 NOW_JD 下的统一排序结果 (当前升序 → 远期升序 → 历史倒序)
ORDERED_KEYS = [
    "s-sim01", "c-1001", "c-1002",          # current
    "c-1003", "s-sim02", "r-apophis",       # upcoming
    "c-1004", "r-ok2019", "s-sim03",        # past (新→旧)
    "r-chelyabinsk", "r-tc3", "r-tunguska",
]


def _engine(db_file):
    return create_async_engine(f"sqlite+aiosqlite:///{db_file}", poolclass=NullPool)


def _seed(db_file) -> None:
    """建表并写入 fixture 行 (每个用例一份全新实例)。"""
    rows = ([_cad(**s) for s in CAD_SPECS] + [_sim(**s) for s in SIM_SPECS])

    async def _run():
        engine = _engine(db_file)
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            async with async_sessionmaker(engine, class_=AsyncSession,
                                          expire_on_commit=False)() as session:
                session.add_all(rows)
                await session.commit()
        finally:
            await engine.dispose()
    asyncio.run(_run())


def _on_db(db_file, fn, **qs_kwargs):
    """在已建好的临时库上执行 fn(session) 并返回结果。"""
    async def _run():
        engine = _engine(db_file)
        try:
            maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
            async with maker() as session:
                return await fn(session, E.EventQuery(now_jd=NOW_JD, **qs_kwargs))
        finally:
            await engine.dispose()
    return asyncio.run(_run())


@pytest.fixture
def db_file(tmp_path):
    path = tmp_path / "events.db"
    _seed(path)
    return path


@pytest.fixture
def client(tmp_path, monkeypatch):
    """路由级用例: 把 main.SessionLocal 指向临时库 (NullPool 保证跨请求安全)。"""
    path = tmp_path / "api.db"
    _seed(path)
    engine = _engine(path)
    monkeypatch.setattr(main, "SessionLocal",
                        async_sessionmaker(engine, class_=AsyncSession,
                                           expire_on_commit=False))
    return TestClient(main.app)


# ---------------------------------------------------------------------------
# 时间与物理量换算
# ---------------------------------------------------------------------------

def test_jd_from_iso_j2000():
    assert abs(E.jd_from_iso("2000-01-01T12:00:00Z") - 2451545.0) < 1e-9


def test_jd_from_iso_naive_is_utc():
    # 无时区尾缀按 UTC 解释 (与前端 dateToJD 的 ms/86400000+2440587.5 同源)
    assert abs(E.jd_from_iso("2000-01-01T12:00:00") - 2451545.0) < 1e-9


def test_jd_from_iso_with_offset():
    assert abs(E.jd_from_iso("2000-01-01T20:00:00+08:00") - 2451545.0) < 1e-9


def test_jd_from_iso_invalid():
    with pytest.raises(ValueError):
        E.jd_from_iso("不是时间")


def test_jd_from_date_boundaries():
    assert abs(E.jd_from_date(date(2000, 1, 1)) - 2451544.5) < 1e-9
    # 结束日取次日 00:00 作开区间上界 → 含当天整天
    assert abs(E.jd_from_date(date(2000, 1, 1), end_of_day=True) - 2451545.5) < 1e-9


def test_now_jd_utc_is_present():
    assert E.now_jd_utc() > E.jd_from_iso("2024-01-01T00:00:00Z")


def test_diam_from_h():
    # 反照率 0.15: H=22 → ~137 m
    assert E.diam_from_h(22.0) == pytest.approx(0.1366, abs=1e-3)
    assert E.diam_from_h(18.0) > E.diam_from_h(22.0)  # 越亮越大


def test_estimate_energy_mt():
    # 50 m / 3000 kg·m⁻³ / 20 km·s⁻¹ ≈ 9.4 Mt TNT
    assert E.estimate_energy_mt(50.0) == pytest.approx(9.39, abs=0.05)
    # 直径下限 0.1 m, 避免 0 直径算出 0 能量后被误判为「无害」
    assert E.estimate_energy_mt(0.0) == E.estimate_energy_mt(0.1) > 0.0


def test_impact_severity_thresholds():
    assert E.impact_severity(12.0) == "critical"   # 通古斯
    assert E.impact_severity(10.0) == "critical"
    assert E.impact_severity(9.39) == "high"
    assert E.impact_severity(1.0) == "high"
    assert E.impact_severity(0.44) == "medium"     # 车里雅宾斯克
    assert E.impact_severity(0.01) == "medium"
    assert E.impact_severity(0.002) == "low"       # 2008 TC3


def test_flyby_severity_thresholds():
    assert E.flyby_severity(38000.0, 0.34) == "critical"   # 阿波菲斯
    assert E.flyby_severity(72000.0, 0.10) == "critical"   # 2019 OK
    assert E.flyby_severity(38000.0, 0.05) == "high"       # 同距离但太小
    assert E.flyby_severity(2 * E.LD_KM, 0.5) == "high"    # ld = 2 边界
    assert E.flyby_severity(10 * E.LD_KM, 0.5) == "medium"  # ld = 10 边界
    assert E.flyby_severity(10.001 * E.LD_KM, 0.5) == "low"


def test_categorize_boundaries():
    assert E.categorize(NOW_JD - 1e-6, NOW_JD) == "past"
    assert E.categorize(NOW_JD, NOW_JD) == "current"
    assert E.categorize(NOW_JD + E.YEAR_DAYS, NOW_JD) == "current"
    assert E.categorize(NOW_JD + E.YEAR_DAYS + 1e-6, NOW_JD) == "upcoming"


# ---------------------------------------------------------------------------
# 内置经典事件目录
# ---------------------------------------------------------------------------

def test_load_builtin_shape():
    recs = E.load_builtin()
    assert len(recs) == 5
    for r in recs:
        assert r["type"] in E.TYPES
        assert {"id", "name", "target", "dateUTC", "diam", "leadH", "el", "desc"} <= set(r)
        assert {"a", "e", "i", "O", "w"} == set(r["el"])
    assert {r["id"] for r in recs} == {
        "tunguska", "tc3", "chelyabinsk", "ok2019", "apophis"}


def test_load_builtin_is_cached():
    assert E.load_builtin() is E.load_builtin()


def test_builtin_record_drops_target():
    rec = next(r for r in E.load_builtin() if r["id"] == "apophis")
    out = E.builtin_record(rec)
    assert "target" not in out          # target 是目录专属字段, 不属于 EventRecord
    assert out["el"] == rec["el"]
    assert out["missKm"] == rec["missKm"]


def test_builtin_jds_sorted_ascending():
    jds = E.builtin_jds()
    assert len(jds) == 5
    assert jds == sorted(jds)           # JSON 内按时间顺序排列


def test_builtin_row_fields():
    rec = next(r for r in E.load_builtin() if r["id"] == "apophis")
    row = E.builtin_row(rec, NOW_JD)
    assert row.key == "r-apophis"
    assert row.source == "builtin"
    assert row.target == "99942 Apophis"
    assert row.date_utc == "2029-04-13T21:46:00Z"
    assert row.diam == 0.34 and row.diam_estimated is False
    assert row.miss_km == 38000.0
    assert row.lead_h == 14.0
    assert row.severity == "critical"
    assert row.category == "upcoming"
    assert row.record is not None and "target" not in row.record


def test_builtin_row_severity_matches_history():
    got = {r["id"]: E.builtin_row(r, NOW_JD).severity for r in E.load_builtin()}
    assert got == {
        "tunguska": "critical", "tc3": "low", "chelyabinsk": "medium",
        "ok2019": "critical", "apophis": "critical",
    }


def test_builtin_row_categories_at_now():
    got = {r["id"]: E.builtin_row(r, NOW_JD).category for r in E.load_builtin()}
    assert got["apophis"] == "upcoming"
    assert all(got[k] == "past" for k in ("tunguska", "tc3", "chelyabinsk", "ok2019"))


def test_builtin_row_estimates_missing_impact_energy():
    rec = {"id": "x", "name": "X", "type": "impact", "dateUTC": "2030-01-01T00:00:00Z",
           "diam": 0.05, "leadH": 8, "el": {"a": 1, "e": 0, "i": 0, "O": 0, "w": 0}}
    row = E.builtin_row(rec, NOW_JD)
    assert row.energy_mt == pytest.approx(E.estimate_energy_mt(50.0))
    assert row.severity == "high"


def test_builtin_row_target_falls_back_to_name():
    rec = {"id": "y", "name": "无名事件", "type": "flyby",
           "dateUTC": "2030-01-01T00:00:00Z", "diam": 0.1, "leadH": 8,
           "el": {"a": 1, "e": 0, "i": 0, "O": 0, "w": 0}, "missKm": 1e6}
    assert E.builtin_row(rec, NOW_JD).target == "无名事件"


# ---------------------------------------------------------------------------
# CAD 行归一
# ---------------------------------------------------------------------------

def test_cad_row_fields():
    row = E.cad_row(CAD_ROWS[0], NOW_JD)
    assert row.key == "c-1001"
    assert row.source == "cad" and row.type == "flyby"
    assert row.name == "2026 A1 接近地球"
    assert row.target == "2026 A1"            # fullname 为空 → 退回临时编号
    assert row.date_utc == "2026-09-20T00:00:00Z"
    assert row.diam == 0.2 and row.diam_estimated is False
    assert row.miss_km == pytest.approx(1.5 * E.LD_KM)
    assert row.v_rel_kms == 6.1
    assert row.lead_h == E.CAD_LEAD_H
    assert row.severity == "high" and row.category == "current"


def test_cad_row_uses_fullname_as_target():
    assert E.cad_row(CAD_ROWS[3], NOW_JD).target == "(2020 D4)"


def test_cad_row_diam_from_h_when_missing():
    row = E.cad_row(CAD_ROWS[2], NOW_JD)
    assert row.diam_estimated is True
    assert row.diam == pytest.approx(E.diam_from_h(22.0))


def test_cad_row_diam_floor_when_all_missing():
    row = E.cad_row(CAD_ROWS[3], NOW_JD)
    assert row.diam_estimated is True
    assert row.diam == E.DIAM_FLOOR_KM
    assert row.v_rel_kms is None


def test_cad_dto_shape():
    dto = E.cad_dto(CAD_ROWS[0])
    assert set(dto) == {"cdId", "orbitId", "des", "fullname", "dateIso", "jd",
                        "distLd", "distMinLd", "distMaxLd",
                        "vRelKms", "h", "diamKm"}
    assert dto["orbitId"] is None
    assert dto["cdId"] == "1001" and dto["des"] == "2026 A1"
    assert dto["fullname"] == ""              # None 归一为空串, 前端可直接渲染


# ---------------------------------------------------------------------------
# 推演事件: 写入列 / 序列化
# ---------------------------------------------------------------------------

_SIM_PAYLOAD = {
    "name": "  推演撞击 Beta  ",
    "desc": "",
    "type": "impact",
    "targetType": "城市",
    "diam": 50.0,
    "dateUTC": "2028-03-01T00:00:00Z",
    "el": {"a": 1.2, "e": 0.3, "i": 5.0, "O": 10.0, "w": 20.0},
    "missKm": 90000.0,
    "impactLat": 30.0,
    "impactLon": 120.0,
    "burstAltKm": 15.0,
    "shockAreaKm2": 100.0,
    "energyMt": None,
    "leadH": 8.0,
}


def test_sim_columns_impact_scopes_fields():
    cols = E.sim_columns(dict(_SIM_PAYLOAD))
    assert cols["name"] == "推演撞击 Beta"      # 去首尾空白
    assert cols["desc"] is None                # 空串归一为 NULL
    assert cols["jd"] == pytest.approx(E.jd_from_iso("2028-03-01T00:00:00Z"))
    assert (cols["a"], cols["e"], cols["i"], cols["om"], cols["w"]) == (1.2, 0.3, 5.0, 10.0, 20.0)
    # 撞击只保留落点/空爆/能量, 最近距离不适用
    assert cols["miss_km"] is None
    assert cols["impact_lat"] == 30.0 and cols["burst_alt_km"] == 15.0
    assert cols["energy_mt"] == pytest.approx(E.estimate_energy_mt(50.0))


def test_sim_columns_flyby_scopes_fields():
    payload = dict(_SIM_PAYLOAD, type="flyby")
    cols = E.sim_columns(payload)
    assert cols["miss_km"] == 90000.0
    assert cols["impact_lat"] is None and cols["impact_lon"] is None
    assert cols["burst_alt_km"] is None and cols["shock_area_km2"] is None
    assert cols["energy_mt"] is None


def test_sim_columns_keeps_given_energy():
    cols = E.sim_columns(dict(_SIM_PAYLOAD, energyMt=3.5))
    assert cols["energy_mt"] == 3.5


def test_sim_dto_roundtrip():
    row = SimEvent(id="s1", **E.sim_columns(dict(_SIM_PAYLOAD)))
    dto = E.sim_dto(row)
    assert dto["id"] == "s1"
    assert dto["name"] == "推演撞击 Beta"
    assert dto["diam"] == 50.0                    # 推演事件直径以米为单位
    assert dto["el"] == {"a": 1.2, "e": 0.3, "i": 5.0, "O": 10.0, "w": 20.0}
    assert dto["energyMt"] == pytest.approx(E.estimate_energy_mt(50.0))
    assert "missKm" not in dto                    # 撞击不落该字段 → 不出现在 DTO


def test_sim_dto_omits_unset_optionals():
    dto = E.sim_dto(SIM_ROWS[0])                  # 飞掠: 无落点/能量
    assert dto["missKm"] == 90000.0
    assert {"impactLat", "burstAltKm", "energyMt"} & set(dto) == set()


def test_sim_record_converts_diam_to_km():
    rec = E.sim_record(SIM_ROWS[1])
    assert rec["diam"] == pytest.approx(0.05)     # 50 m → 0.05 km
    assert rec["el"] == {"a": 1.2, "e": 0.3, "i": 5.0, "O": 10.0, "w": 20.0}
    assert rec["img"] == "" and rec["credit"] == "" and rec["news"] == ""
    assert rec["impactLat"] == 30.0 and "missKm" not in rec


def test_sim_row_fields():
    row = E.sim_row(SIM_ROWS[0], NOW_JD)
    assert row.key == "s-sim01" and row.source == "sim"
    assert row.target == row.name                 # 推演事件的风险目标即事件本身
    assert row.diam == pytest.approx(0.12)        # 120 m → 0.12 km
    assert row.severity == "critical"             # ld 0.234 且直径 >= 100 m
    assert row.category == "current"
    assert row.record is not None


def test_sim_row_estimates_missing_impact_energy():
    row = E.sim_row(SIM_ROWS[1], NOW_JD)          # 入库时 energy_mt 为空
    assert row.energy_mt == pytest.approx(E.estimate_energy_mt(50.0))
    assert row.severity == "high"


# ---------------------------------------------------------------------------
# DTO / 排序 / 过滤
# ---------------------------------------------------------------------------

def test_event_dto_base_fields():
    dto = E.event_dto(E.cad_row(CAD_ROWS[2], NOW_JD))
    assert dto["key"] == "c-1003"
    assert dto["source"] == "cad" and dto["type"] == "flyby"
    assert dto["jdEnc"] == pytest.approx(E.jd_from_iso("2027-12-01T06:30:00Z"))
    assert dto["leadH"] == E.CAD_LEAD_H
    assert dto["severity"] == "medium" and dto["category"] == "upcoming"
    assert dto["diamEstimated"] is True
    assert dto["cad"]["cdId"] == "1003"


def test_event_dto_omits_absent_fields():
    dto = E.event_dto(E.builtin_row(
        next(r for r in E.load_builtin() if r["id"] == "tc3"), NOW_JD))
    assert {"diamEstimated", "missKm", "vRelKms", "cad", "record"} & set(dto) == set()
    assert dto["energyMt"] == 0.002


def test_event_dto_record_only_on_detail():
    row = E.builtin_row(next(r for r in E.load_builtin() if r["id"] == "tunguska"), NOW_JD)
    assert "record" not in E.event_dto(row)
    detail = E.event_dto(row, include_record=True)
    assert detail["record"]["img"] == "/events/tunguska.jpg"
    assert detail["record"]["shockAreaKm2"] == 2000


def test_sort_key_category_then_time():
    rows = [E.builtin_row(r, NOW_JD) for r in E.load_builtin()]
    rows += [E.cad_row(r, NOW_JD) for r in CAD_ROWS]
    rows += [E.sim_row(r, NOW_JD) for r in SIM_ROWS]
    rows.sort(key=E._sort_key)
    assert [r.key for r in rows] == ORDERED_KEYS


def test_match_keyword_hits_name_and_target():
    qs = E.EventQuery(now_jd=NOW_JD)
    apophis = E.builtin_row(
        next(r for r in E.load_builtin() if r["id"] == "apophis"), NOW_JD)
    assert E._match(apophis, E.EventQuery(now_jd=NOW_JD, q="APOPHIS"))   # 命中 target, 大小写不敏感
    assert E._match(apophis, E.EventQuery(now_jd=NOW_JD, q="阿波菲斯"))   # 命中 name
    assert not E._match(apophis, E.EventQuery(now_jd=NOW_JD, q="通古斯"))
    assert E._match(apophis, qs)                                          # 无条件全通过


def test_match_severity_and_category():
    row = E.cad_row(CAD_ROWS[3], NOW_JD)          # medium / past
    assert not E._match(row, E.EventQuery(now_jd=NOW_JD, severity="high"))
    assert E._match(row, E.EventQuery(now_jd=NOW_JD, severity="medium"))
    assert not E._match(row, E.EventQuery(now_jd=NOW_JD, category="current"))
    assert E._match(row, E.EventQuery(now_jd=NOW_JD, category="past"))


# ---------------------------------------------------------------------------
# 查询编排 (临时库)
# ---------------------------------------------------------------------------

def test_catalog_counts_are_catalog_wide(db_file):
    counts = _on_db(db_file, lambda s, qs: E.catalog_counts(s, qs.now_jd))
    assert counts == {"all": 12, "current": 3, "upcoming": 3, "past": 6, "sim": 3}


def test_query_events_merges_three_sources(db_file):
    out = _on_db(db_file, E.query_events, size=50)
    assert out["total"] == 12
    assert [r["key"] for r in out["data"]] == ORDERED_KEYS
    assert out["pages"] == 1 and out["page"] == 1
    assert out["nowJd"] == NOW_JD
    assert out["counts"]["all"] == 12


def test_query_events_stats_use_filtered_rows_before_paging(db_file):
    out = _on_db(db_file, E.query_events, source="sim", size=1)
    stats = out["stats"]
    assert out["total"] == 3 and len(out["data"]) == 1
    assert stats["total"] == 3
    assert stats["real"] == 0 and stats["simulated"] == 3
    assert stats["bySource"] == {"builtin": 0, "cad": 0, "sim": 3}
    assert sum(stats["bySeverity"].values()) == 3
    assert len(stats["monthly"]) == 12


def test_query_events_stats_empty_scope_has_stable_shape(db_file):
    stats = _on_db(db_file, E.query_events, q="绝无此关键字", size=5)["stats"]
    assert stats["total"] == stats["real"] == stats["simulated"] == 0
    assert stats["highlights"] == {"next": None, "closest": None, "largest": None}
    assert all(bucket["count"] == 0 for bucket in stats["monthly"])


def test_query_events_pagination_slices_in_order(db_file):
    first = _on_db(db_file, E.query_events, page=1, size=5)
    second = _on_db(db_file, E.query_events, page=2, size=5)
    third = _on_db(db_file, E.query_events, page=3, size=5)
    assert first["pages"] == second["pages"] == third["pages"] == 3
    assert [r["key"] for r in first["data"]] == ORDERED_KEYS[0:5]
    assert [r["key"] for r in second["data"]] == ORDERED_KEYS[5:10]
    assert [r["key"] for r in third["data"]] == ORDERED_KEYS[10:12]
    assert first["total"] == second["total"] == third["total"] == 12


def test_query_events_page_clamped_to_last(db_file):
    out = _on_db(db_file, E.query_events, page=99, size=5)
    assert out["page"] == 3
    assert [r["key"] for r in out["data"]] == ORDERED_KEYS[10:12]


def test_query_events_empty_page_keeps_total(db_file):
    out = _on_db(db_file, E.query_events, q="绝无此关键字", size=5)
    assert out["total"] == 0 and out["data"] == [] and out["pages"] == 1
    assert out["counts"]["all"] == 12            # 计数是全目录口径, 不受检索影响


def test_query_events_size_zero_returns_counts_only(db_file):
    out = _on_db(db_file, E.query_events, size=0)
    assert out["data"] == [] and out["size"] == 0 and out["pages"] == 1
    assert out["counts"] == {"all": 12, "current": 3, "upcoming": 3, "past": 6, "sim": 3}


def test_query_events_source_filter(db_file):
    assert [r["key"] for r in _on_db(db_file, E.query_events, source="builtin", size=50)["data"]] == [
        "r-apophis", "r-ok2019", "r-chelyabinsk", "r-tc3", "r-tunguska"]
    assert _on_db(db_file, E.query_events, source="cad", size=50)["total"] == 4
    assert _on_db(db_file, E.query_events, source="sim", size=50)["total"] == 3


def test_query_events_type_filter_excludes_cad_for_impact(db_file):
    out = _on_db(db_file, E.query_events, type="impact", size=50)
    keys = [r["key"] for r in out["data"]]
    assert keys == ["s-sim02", "s-sim03", "r-chelyabinsk", "r-tc3", "r-tunguska"]
    assert not any(k.startswith("c-") for k in keys)
    assert _on_db(db_file, E.query_events, type="flyby", size=50)["total"] == 7


def test_query_events_severity_filter(db_file):
    out = _on_db(db_file, E.query_events, severity="critical", size=50)
    assert [r["key"] for r in out["data"]] == [
        "s-sim01", "r-apophis", "r-ok2019", "r-tunguska"]


def test_query_events_category_filter(db_file):
    out = _on_db(db_file, E.query_events, category="past", size=50)
    assert [r["key"] for r in out["data"]] == ORDERED_KEYS[6:]


def test_query_events_keyword_filter(db_file):
    assert [r["key"] for r in _on_db(db_file, E.query_events, q="2026", size=50)["data"]] == [
        "c-1001", "c-1002"]
    assert [r["key"] for r in _on_db(db_file, E.query_events, q="apophis", size=50)["data"]] == [
        "r-apophis"]
    assert _on_db(db_file, E.query_events, q="推演", size=50)["total"] == 3


def test_query_events_time_range_window(db_file):
    qs_from = E.jd_from_date(date(2026, 9, 1))
    qs_to = E.jd_from_date(date(2026, 10, 31), end_of_day=True)
    out = _on_db(db_file, E.query_events, jd_from=qs_from, jd_to=qs_to, size=50)
    assert [r["key"] for r in out["data"]] == ["s-sim01", "c-1001", "c-1002"]
    assert out["counts"]["all"] == 12            # 时间范围只影响列表, 不影响角标


def test_query_events_time_range_end_of_day_inclusive(db_file):
    # 2026-10-05T12:00 的事件必须被 date_to=2026-10-05 覆盖 (整天开区间上界)
    qs_to = E.jd_from_date(date(2026, 10, 5), end_of_day=True)
    out = _on_db(db_file, E.query_events, jd_from=E.jd_from_date(date(2026, 10, 5)),
                 jd_to=qs_to, size=50)
    assert [r["key"] for r in out["data"]] == ["c-1002"]
    # 不含 end_of_day 时正午事件被排除
    out = _on_db(db_file, E.query_events, jd_from=E.jd_from_date(date(2026, 10, 5)),
                 jd_to=E.jd_from_date(date(2026, 10, 5)), size=50)
    assert out["data"] == []


def test_query_events_history_range_reaches_builtin(db_file):
    # 自定义历史区间可查到 1908 通古斯 (预设「未来 N 天」窗口查不到)
    out = _on_db(db_file, E.query_events,
                 jd_from=E.jd_from_date(date(1908, 6, 1)),
                 jd_to=E.jd_from_date(date(1908, 6, 30), end_of_day=True), size=50)
    assert [r["key"] for r in out["data"]] == ["r-tunguska"]


def test_find_event_by_route_key(db_file):
    async def _all(session, _qs):
        return {
            "builtin": await E.find_event(session, "r-tunguska", NOW_JD),
            "cad": await E.find_event(session, "c-1001", NOW_JD),
            "sim": await E.find_event(session, "s-sim02", NOW_JD),
        }
    got = _on_db(db_file, _all)
    assert got["builtin"].record["img"] == "/events/tunguska.jpg"
    assert got["cad"].name == "2026 A1 接近地球"
    assert got["sim"].type == "impact"


def test_find_event_unknown_keys(db_file):
    async def _all(session, _qs):
        return [await E.find_event(session, k, NOW_JD) for k in
                ("r-nope", "c-9999", "s-nope", "x-1", "tunguska", "r-", "")]
    assert all(row is None for row in _on_db(db_file, _all))


def test_route_list_events_keyword_keeps_order_and_limit(client):
    """全局检索复用列表接口的 q 参数: 排序口径一致, size 即命中上限。"""
    r = client.get("/api/events", params={"q": "2026", "size": 1, "now_jd": NOW_JD})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 2 and body["pages"] == 2
    assert [x["key"] for x in body["data"]] == ["c-1001"]


def test_route_list_events_keyword_no_hit(client):
    r = client.get("/api/events", params={"q": "zzz", "now_jd": NOW_JD})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0 and body["data"] == []
    # 页签计数为全目录口径, 不随检索条件变化
    assert body["counts"] == {"all": 12, "current": 3, "upcoming": 3, "past": 6, "sim": 3}


# ---------------------------------------------------------------------------
# 路由层: 日期区间换算 / 校验 / CRUD
# ---------------------------------------------------------------------------

def test_route_list_events_default_paging(client):
    r = client.get("/api/events", params={"size": 5, "now_jd": NOW_JD})
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 12 and body["page"] == 1 and body["pages"] == 3
    assert [x["key"] for x in body["data"]] == ORDERED_KEYS[0:5]


def test_route_list_events_date_range(client):
    r = client.get("/api/events", params={
        "size": 50, "now_jd": NOW_JD,
        "date_from": "2026-09-01", "date_to": "2026-10-31",
    })
    assert r.status_code == 200
    assert [x["key"] for x in r.json()["data"]] == ["s-sim01", "c-1001", "c-1002"]


def test_route_list_events_rejects_inverted_range(client):
    r = client.get("/api/events", params={"date_from": "2026-10-31", "date_to": "2026-09-01"})
    assert r.status_code == 422
    assert "时间范围起点晚于终点" in str(r.json()["detail"])


def test_route_list_events_rejects_bad_enum(client):
    assert client.get("/api/events", params={"source": "jpl"}).status_code == 422
    assert client.get("/api/events", params={"type": "explosion"}).status_code == 422
    assert client.get("/api/events", params={"page": 0}).status_code == 422
    assert client.get("/api/events", params={"size": 999}).status_code == 422


def test_route_list_events_blank_keyword_ignored(client):
    r = client.get("/api/events", params={"q": "   ", "size": 50, "now_jd": NOW_JD})
    assert r.json()["total"] == 12


def test_route_builtin_endpoint(client):
    r = client.get("/api/events/builtin")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "builtin" and len(body["data"]) == 5
    assert all("target" not in rec for rec in body["data"])
    assert {rec["id"] for rec in body["data"]} == {
        "tunguska", "tc3", "chelyabinsk", "ok2019", "apophis"}


def test_route_event_detail_includes_record(client):
    r = client.get("/api/events/r-tunguska", params={"now_jd": NOW_JD})
    assert r.status_code == 200
    body = r.json()
    assert body["key"] == "r-tunguska" and body["severity"] == "critical"
    assert body["record"]["el"]["a"] == 1.6
    assert body["desc"]


def test_route_event_detail_404(client):
    assert client.get("/api/events/r-nope").status_code == 404
    assert client.get("/api/events/c-9999").status_code == 404


def test_route_sim_crud_roundtrip(client):
    payload = {
        "name": "新推演事件", "desc": "由单测创建", "type": "impact",
        "targetType": "城市", "diam": 60.0, "dateUTC": "2031-05-01T00:00:00Z",
        "el": {"a": 1.1, "e": 0.2, "i": 3.0, "O": 40.0, "w": 50.0},
        "impactLat": 10.0, "impactLon": 20.0, "burstAltKm": 12.0,
        "shockAreaKm2": 300.0, "leadH": 24.0,
    }
    created = client.post("/api/sim-events", json=payload)
    assert created.status_code == 201
    sim_id = created.json()["id"]
    assert created.json()["diam"] == 60.0
    assert created.json()["energyMt"] == pytest.approx(E.estimate_energy_mt(60.0))

    # 新事件进入统一目录, 且落在「远期」组
    listed = client.get("/api/events", params={"size": 50, "now_jd": NOW_JD}).json()
    assert listed["total"] == 13 and listed["counts"]["sim"] == 4
    assert f"s-{sim_id}" in [x["key"] for x in listed["data"]]

    updated = client.put(f"/api/sim-events/{sim_id}",
                         json=dict(payload, name="改名后的推演事件", diam=80.0))
    assert updated.status_code == 200
    assert updated.json()["name"] == "改名后的推演事件"
    assert updated.json()["diam"] == 80.0

    detail = client.get(f"/api/events/s-{sim_id}", params={"now_jd": NOW_JD}).json()
    assert detail["name"] == "改名后的推演事件"
    assert detail["record"]["diam"] == pytest.approx(0.08)

    assert client.delete(f"/api/sim-events/{sim_id}").json() == {"ok": True, "id": sim_id}
    assert client.get("/api/events", params={"size": 50, "now_jd": NOW_JD}).json()["total"] == 12


def test_route_sim_list_and_404(client):
    body = client.get("/api/sim-events").json()
    assert body["source"] == "db"
    assert [x["id"] for x in body["data"]] == ["sim03", "sim01", "sim02"]  # 按 jd 升序
    assert client.put("/api/sim-events/nope", json={
        "name": "x", "diam": 1.0, "dateUTC": "2030-01-01T00:00:00Z",
        "el": {"a": 1.0, "e": 0.0, "i": 0.0, "O": 0.0, "w": 0.0}, "leadH": 1.0,
    }).status_code == 404
    assert client.delete("/api/sim-events/nope").status_code == 404


def test_route_sim_payload_validation(client):
    base = {"name": "x", "diam": 1.0, "dateUTC": "2030-01-01T00:00:00Z",
            "el": {"a": 1.0, "e": 0.0, "i": 0.0, "O": 0.0, "w": 0.0}, "leadH": 1.0}
    assert client.post("/api/sim-events", json=dict(base, dateUTC="明年某天")).status_code == 422
    assert client.post("/api/sim-events", json=dict(base, diam=0)).status_code == 422
    assert client.post("/api/sim-events", json=dict(base, name="")).status_code == 422
    assert client.post("/api/sim-events", json=dict(
        base, el=dict(base["el"], e=1.5))).status_code == 422
    assert client.post("/api/sim-events", json=dict(base, impactLat=91)).status_code == 422
