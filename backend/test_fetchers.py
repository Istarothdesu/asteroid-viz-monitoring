"""fetchers 解析逻辑单元测试 (不依赖网络)。"""

import asyncio

import fetchers as F


# ---------- 历元与儒略日 ----------

def test_jd_from_date_j2000():
    assert abs(F.jd_from_date(2000, 1, 1.5) - 2451545.0) < 1e-9


def test_jd_from_date_1999():
    assert abs(F.jd_from_date(1999, 1, 1.0) - 2451179.5) < 1e-9


def test_parse_epoch_valid():
    # K256O = 2025-06-24.0 UT
    jd = F.parse_mpcorb_epoch("K256O")
    assert jd is not None
    assert abs(jd - F.jd_from_date(2025, 6, 24.0)) < 1e-9


def test_parse_epoch_packed_letters():
    # J99C1V -> 1999-12-31
    jd = F.parse_mpcorb_epoch("J99CV")
    assert jd is not None
    assert abs(jd - F.jd_from_date(1999, 12, 31.0)) < 1e-9


def test_parse_epoch_invalid():
    assert F.parse_mpcorb_epoch("XXXXX") is None
    assert F.parse_mpcorb_epoch("K25") is None


# ---------- MPCORB 行解析 ----------

def _mpcorb_line(h=" 3.52", epoch="K256O", m="307.93521", w="72.31193",
                 om="80.26266", i="10.58740", e="0.0784988",
                 n="0.21406879 ", a="2.7674947") -> str:
    """按 MPCORB 固定列宽拼一行。"""
    buf = list(" " * 130)

    def put(start: int, s: str):
        for k, ch in enumerate(s):
            buf[start + k] = ch

    put(0, "00001")
    put(8, h)
    put(14, "0.15")
    put(20, epoch)
    put(26, m)
    put(37, w)
    put(48, om)
    put(59, i)
    put(70, e)
    put(80, n)
    put(92, a)
    return "".join(buf)


def test_parse_mpcorb_line():
    item = F.parse_mpcorb_line(_mpcorb_line())
    assert item is not None
    assert abs(item["a"] - 2.7674947) < 1e-9
    assert abs(item["e"] - 0.0784988) < 1e-12
    assert abs(item["i"] - 10.58740) < 1e-9
    assert abs(item["om"] - 80.26266) < 1e-9
    assert abs(item["w"] - 72.31193) < 1e-9
    assert abs(item["epoch_jd"] - F.jd_from_date(2025, 6, 24.0)) < 1e-9
    assert abs(item["mag_h"] - 3.52) < 1e-9


def test_parse_mpcorb_line_bad():
    assert F.parse_mpcorb_line("短行") is None
    assert F.parse_mpcorb_line(_mpcorb_line(a="X" * 19)) is None
    assert F.parse_mpcorb_line(_mpcorb_line(e="1.2      ")) is None


# 线上抓回的真实行 (谷神星): a 切片不得侵入 U 标志/参考字段
_REAL_CERES = ("00001    3.34  0.15 K2669 274.41935   73.29420   80.24863   10.58803"
               "  0.0796923  0.21430445   2.7655526  0 MPO980521  7297 126 1801-2026"
               " 0.83 M-v 30k Veres      4000      (1) Ceres              20260103")


def test_parse_mpcorb_real_line():
    item = F.parse_mpcorb_line(_REAL_CERES)
    assert item is not None
    assert abs(item["a"] - 2.7655526) < 1e-9
    assert abs(item["e"] - 0.0796923) < 1e-12
    assert abs(item["i"] - 10.58803) < 1e-9
    assert abs(item["w"] - 73.29420) < 1e-9
    assert abs(item["om"] - 80.24863) < 1e-9
    assert abs(item["mag_h"] - 3.34) < 1e-9
    assert item["epoch_jd"] == F.jd_from_date(2026, 6, 9.0)  # K2669 = 2026-06-09
    assert item["designation"] == "(1) Ceres"


# ---------- MPCORB 身份提取 ----------

def test_identity_fixed_width_ceres():
    assert F.parse_mpcorb_identity(_REAL_CERES) == "(1) Ceres"


def test_identity_short_line_empty():
    # 130 字符短行无 166-193 身份区且行尾无编号模式 → 空串
    assert F.parse_mpcorb_identity(_mpcorb_line()) == ""


def test_identity_regex_fallback_provisional():
    # 行短于 166 列时走正则兜底: 末次观测日期前的临时编号 (数字必须保留)
    buf = list(_mpcorb_line())
    tail = "2014 KP4   20260103"
    buf[len(buf) - len(tail):] = tail
    assert F.parse_mpcorb_identity("".join(buf)) == "2014 KP4"


def test_parse_mpcorb_unnumbered_line():
    # 未编号天体 (世纪符开头) 与高编号 (~ 压缩开头) 行同样可解析
    for des in ("K25A00A", "~AZUB4"):
        line = list(_mpcorb_line())
        line[0:len(des)] = des
        item = F.parse_mpcorb_line("".join(line))
        assert item is not None and abs(item["a"] - 2.7674947) < 1e-9


# ---------- M0 归一化 ----------

def test_m0_to_j2000_roundtrip():
    a = 2.7674947
    epoch = F.JD_J2000 + 100.0
    m_epoch = 123.456
    m0 = F.m0_to_j2000(m_epoch, epoch, a)
    n_deg = F.N_DEG_K / (a * a**0.5)
    back = (m0 + n_deg * 100.0) % 360.0
    assert abs(back - m_epoch) < 1e-9


# ---------- 分类 ----------

def test_classify():
    assert F.classify_orbit(2.77, 0.08) == "main_belt"
    assert F.classify_orbit(1.1, 0.5) == "neo"       # q = 0.55
    assert F.classify_orbit(5.2, 0.10) == "trojan"   # q = 4.68
    assert F.classify_orbit(3.97, 0.14) == "hilda"
    assert F.classify_orbit(44.0, 0.1) == "kuiper"
    assert F.classify_orbit(7.0, 0.3) is None        # 半人马不采样


# ---------- 蓄水池抽样 ----------

def test_reservoir_quota():
    quota = {"main_belt": 10, "neo": 3, "hilda": 2, "trojan": 2, "kuiper": 2}
    s = F.ReservoirSampler(quota)
    for k in range(500):
        s.offer({"a": 2.5, "e": 0.1, "i": 5.0, "om": 0, "w": 0, "m0": 0,
                 "epoch_jd": F.JD_J2000, "mag_h": 12.0})
    for k in range(50):
        s.offer({"a": 1.1, "e": 0.4, "i": 5.0, "om": 0, "w": 0, "m0": 0,
                 "epoch_jd": F.JD_J2000, "mag_h": 20.0})
    for k in range(10):
        s.offer({"a": 7.0, "e": 0.3, "i": 5.0, "om": 0, "w": 0, "m0": 0,
                 "epoch_jd": F.JD_J2000, "mag_h": 10.0})  # 半人马, 丢弃
    assert len(s.pools["main_belt"]) == 10
    assert len(s.pools["neo"]) == 3
    assert len(s.pools["hilda"]) == 0
    assert s.total == 560


# ---------- SBDB 响应解析 (mock) ----------

class _FakeResp:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._p = payload

    def json(self):
        return self._p

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class _FakeClient:
    def __init__(self, payload: dict, status_code: int = 200):
        self.resp = _FakeResp(status_code, payload)
        self.last_params = None

    async def get(self, url, params=None):
        self.last_params = params
        return self.resp


_SBDB_PAYLOAD = {
    "object": {
        "des": "101955", "fullname": "101955 Bennu (1999 RQ36)",
        "neo": True, "pha": True,
        "orbit_class": {"code": "APO", "name": "Apollo Asteroid"},
    },
    "orbit": {
        "epoch": "2461200.5", "moid": "0.00325",
        "elements": [
            {"label": "e", "value": "0.204"},
            {"label": "a", "value": "1.13"},
            {"label": "i", "value": "6.03"},
            {"label": "node", "value": "2.06"},
            {"label": "peri", "value": "66.2"},
            {"label": "M", "value": "102.0"},
            {"label": "period", "value": "437"},
        ],
    },
}


def test_fetch_sbdb_parse():
    client = _FakeClient(_SBDB_PAYLOAD)
    d = asyncio.run(F.fetch_sbdb(client, "101955"))
    assert d is not None
    assert d["designation"] == "101955"
    assert d["a"] == 1.13 and d["e"] == 0.204
    assert d["neo"] is True and d["pha"] is True
    assert d["orbit_class"] == "Apollo Asteroid"
    assert abs(d["moid_au"] - 0.00325) < 1e-12
    assert abs(d["period_d"] - 437.0) < 1e-9
    # m0 应归一化到 J2000 且可正推回历元时刻
    n_deg = F.N_DEG_K / (1.13 * 1.13**0.5)
    back = (d["m0"] + n_deg * (2461200.5 - F.JD_J2000)) % 360.0
    assert abs(back - 102.0) < 1e-6


def test_fetch_sbdb_missing():
    d = asyncio.run(F.fetch_sbdb(_FakeClient({}, 404), "999999999"))
    assert d is None


_COV_PAYLOAD = {
    "object": {"des": "101955"},
    "orbit": {
        "orbit_id": "123", "epoch": "2461200.5",
        "covariance": {
            "epoch": "2461190.5", "labels": ["e", "q"],
            "elements": [{"label": "e", "value": "0.12"}, {"label": "q", "value": "0.93"}],
            "data": [["1.0E-8", "2.0E-9"], ["2.0E-9", "3.0E-8"]],
        },
    },
    "signature": {"version": "1.3"},
}


def test_fetch_orbit_covariance_parse():
    d = asyncio.run(F.fetch_orbit_covariance(_FakeClient(_COV_PAYLOAD), "101955"))
    assert d is not None
    assert d["designation"] == "101955"
    assert d["orbit_solution_id"] == "123"
    assert d["labels"] == ["e", "q"]
    assert d["data"] == [[1e-8, 2e-9], [2e-9, 3e-8]]
    assert d["elements"] == {"e": 0.12, "q": 0.93}


def test_fetch_orbit_covariance_falls_back_to_orbit_elements_at_same_epoch():
    payload = {
        **_COV_PAYLOAD,
        "orbit": {
            **_COV_PAYLOAD["orbit"],
            "epoch": "2461190.5",
            "elements": [
                {"label": "e", "value": "0.12"},
                {"label": "q", "value": "0.93"},
            ],
            "covariance": {
                **_COV_PAYLOAD["orbit"]["covariance"],
                "elements": None,
            },
        },
    }
    d = asyncio.run(F.fetch_orbit_covariance(_FakeClient(payload), "101955"))
    assert d is not None
    assert d["elements"] == {"e": 0.12, "q": 0.93}


def test_fetch_orbit_covariance_requires_square_matrix():
    payload = {**_COV_PAYLOAD, "orbit": {**_COV_PAYLOAD["orbit"], "covariance": {
        **_COV_PAYLOAD["orbit"]["covariance"], "data": [["1"], ["2"]],
    }}}
    assert asyncio.run(F.fetch_orbit_covariance(_FakeClient(payload), "101955")) is None


def test_fetch_orbit_bundle_uses_one_versioned_response():
    payload = {
        **_SBDB_PAYLOAD,
        "orbit": {
            **_SBDB_PAYLOAD["orbit"],
            "orbit_id": "123",
            "covariance": {
                "epoch": "2461200.5",
                "labels": ["e", "q"],
                "data": [["1e-8", "0"], ["0", "2e-8"]],
            },
        },
    }
    client = _FakeClient(payload)
    orbit, covariance = asyncio.run(F.fetch_orbit_bundle(client, "101955"))
    assert orbit is not None and covariance is not None
    assert orbit["orbit_solution_id"] == covariance["orbit_solution_id"] == "123"
    assert client.last_params == {"sstr": "101955", "cov": "mat", "full-prec": "true"}


def test_fetch_sentry_summaries_parse():
    payload = {
        "signature": {"version": "2.0"},
        "data": [{
            "des": "2021 GE2", "fullname": "(2021 GE2)", "id": "bK21G02E",
            "ip": "7.405e-04", "n_imp": 1, "ps_cum": "-3.93", "ps_max": "-3.93",
            "ts_max": "0", "v_inf": "12.5", "range": "2030-2030", "last_obs": "2021-04-01",
        }],
    }
    rows, version = asyncio.run(F.fetch_sentry_summaries(_FakeClient(payload)))
    assert version == "2.0" and len(rows) == 1
    assert rows[0]["impact_probability"] == 7.405e-04
    assert rows[0]["virtual_impactor_count"] == 1


# ---------- CAD 响应解析 (mock) ----------

_CAD_PAYLOAD = {
    "fields": ["des", "orbit_id", "jd", "cd", "dist", "dist_min",
               "dist_max", "v_rel", "v_inf", "t_sigma_f", "h", "fullname"],
    "count": 1,
    "data": [
        ["2016 YC8", "18", "2461253.514388494", "2026-Aug-01 00:21",
         "0.21193", "0.21183", "0.21204", "4.8036", "4.8009",
         "00:57", "24.6", "       (2016 YC8)"],
    ],
}


def test_fetch_cad_parse():
    client = _FakeClient(_CAD_PAYLOAD)
    evs = asyncio.run(F.fetch_cad(client))
    assert len(evs) == 1
    ev = evs[0]
    assert ev["designation"] == "2016 YC8"
    assert ev["fullname"] == "2016 YC8"
    assert ev["date_iso"] == "2026-08-01T00:21:00"
    assert abs(ev["jd"] - 2461253.514388494) < 1e-9
    assert abs(ev["dist_ld"] - 0.21193 * F.AU_KM / F.LD_KM) < 1e-9
    assert ev["h_mag"] == 24.6
    assert ev["diam_km"] is not None and ev["diam_km"] < 1.0  # H=24.6 → 亚百米级


def test_parse_cad_date():
    assert F._parse_cad_date("2029-Apr-13 21:46") == "2029-04-13T21:46:00"


# ---------- MPCORB 分段续传下载 ----------

class _FakeSegResp:
    def __init__(self, body: bytes, status: int = 206):
        self._body = body
        self.status_code = status

    async def aread(self):
        return self._body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _FakeSegClient:
    """按 Range 返回内存文件切片; 可指定某些请求中途断连。"""

    def __init__(self, blob: bytes, fail_offsets: set[int] = ()):
        self.blob = blob
        self.fail_offsets = set(fail_offsets)
        self.requests = 0

    def stream(self, method: str, url: str, headers=None):
        self.requests += 1
        rng = (headers or {}).get("Range", "")
        start = int(rng.split("=")[1].split("-")[0])
        if start in self.fail_offsets:
            self.fail_offsets.discard(start)

            async def _boom():
                raise httpx.RemoteProtocolError("peer closed")

            class _Boom:
                status_code = 206
                aread = staticmethod(_boom)

                async def __aenter__(self):
                    return self

                async def __aexit__(self, *a):
                    return False

            return _Boom()
        end = int(rng.split("-")[1])
        seg = self.blob[start:end + 1]
        status = 206 if start > 0 or len(seg) == end - start + 1 else 200
        return _FakeSegResp(seg, status)


def _collect(client, total, chunk):
    async def _run():
        return [ln async for ln in F._iter_mpcorb_lines(
            client, total_size=total, max_retries=3, chunk=chunk)]
    return asyncio.run(_run())


import httpx  # noqa: E402  (仅供 _FakeSegClient 断连异常用)


def test_ranged_download_reassembles_lines():
    blob = ("header comment\n" + "\n".join(f"line-{i}" for i in range(20)) + "\n").encode()
    client = _FakeSegClient(blob)
    lines = _collect(client, len(blob), chunk=37)  # 段边界必然切在行中
    assert lines == ["header comment"] + [f"line-{i}" for i in range(20)]
    assert client.requests >= 3


def test_ranged_download_recovers_from_disconnect():
    blob = ("\n".join(f"line-{i}" for i in range(12)) + "\n").encode()
    client = _FakeSegClient(blob, fail_offsets={30})  # 第 2 段首次请求断连
    lines = _collect(client, len(blob), chunk=30)
    assert lines == [f"line-{i}" for i in range(12)]


def test_ranged_download_no_trailing_newline():
    blob = ("\n".join(f"line-{i}" for i in range(8))).encode()  # 末尾无换行
    client = _FakeSegClient(blob)
    lines = _collect(client, len(blob), chunk=25)
    assert lines == [f"line-{i}" for i in range(8)]


def test_diam_from_h():
    # H=18 约对应 ~900 m (反照率 0.14)
    d = F.diam_from_h(18.0)
    assert 0.5 < d < 1.5
