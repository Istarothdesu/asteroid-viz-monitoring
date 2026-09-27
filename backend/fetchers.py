"""外部数据源抓取与解析: JPL SBDB / JPL CAD / MPC MPCORB.DAT。"""

import asyncio
import logging
import random
import re
from datetime import date

import httpx

log = logging.getLogger(__name__)

SBDB_URL = "https://ssd-api.jpl.nasa.gov/sbdb.api"
CAD_URL = "https://ssd-api.jpl.nasa.gov/cad.api"
SENTRY_URL = "https://ssd-api.jpl.nasa.gov/sentry.api"
MPCORB_URL = "https://www.minorplanetcenter.net/iau/MPCORB/MPCORB.DAT"

JD_J2000 = 2451545.0
# 高斯引力常数换算的平运动 (度/日) = k[rad/d] * 180/pi / a^1.5
N_DEG_K = 0.9856076686
# H 星等 → 直径 (km), 假设几何反照率 0.14: D = 1329 * 10^(-H/5) / sqrt(p)
ALBEDO_ASSUMED = 0.14
AU_KM = 149597870.7
LD_KM = 384400.0


def diam_from_h(h: float) -> float:
    return 1329.0 * 10.0 ** (-h / 5.0) / (ALBEDO_ASSUMED ** 0.5)


def m0_to_j2000(m_at_epoch: float, epoch_jd: float, a: float) -> float:
    """把某历元的平近点角归一化为 J2000 历元 (度, [0,360))。"""
    n_deg = N_DEG_K / (a * a**0.5)
    return (m_at_epoch - n_deg * (epoch_jd - JD_J2000)) % 360.0


# ---------- JPL SBDB ----------

def parse_sbdb(j: dict, sstr: str) -> dict | None:
    """从一份 SBDB 响应解析轨道根数。"""
    obj, orb = j.get("object") or {}, j.get("orbit") or {}
    els = {el["label"]: el["value"] for el in orb.get("elements", [])}
    try:
        a = float(els["a"])
        m_epoch = float(els["M"])
        epoch_jd = float(orb["epoch"])
    except (KeyError, ValueError, TypeError):
        log.warning("SBDB %s: 缺少必要根数", sstr)
        return None

    return {
        "designation": obj.get("des", sstr),
        "fullname": obj.get("fullname"),
        "orbit_solution_id": str(orb["orbit_id"]) if orb.get("orbit_id") is not None else None,
        "a": a,
        "e": float(els["e"]),
        "i": float(els["i"]),
        "om": float(els["node"]),
        "w": float(els["peri"]),
        "m0": m0_to_j2000(m_epoch, epoch_jd, a),
        "epoch_jd": epoch_jd,
        "period_d": float(els["period"]) if "period" in els else None,
        "orbit_class": (obj.get("orbit_class") or {}).get("name"),
        "neo": bool(obj.get("neo")),
        "pha": bool(obj.get("pha")),
        "moid_au": float(orb["moid"]) if orb.get("moid") else None,
    }


async def fetch_sbdb(client: httpx.AsyncClient, sstr: str) -> dict | None:
    """查询单颗小行星, 返回解析后的轨道根数字典; 失败返回 None。

    必须 full-prec: 缺省时 SBDB 返回展示级舍入值 (M 精确到个位度数!),
    曾导致谷神星在历元时刻偏差 345 万 km (validate.py 校验项 4 抓获)。"""
    r = await client.get(SBDB_URL, params={"sstr": sstr, "full-prec": "true"})
    if r.status_code != 200:
        log.warning("SBDB %s -> HTTP %d", sstr, r.status_code)
        return None
    return parse_sbdb(r.json(), sstr)


def _as_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_orbit_covariance(j: dict, sstr: str) -> dict | None:
    """从一份 SBDB 响应解析与解版本绑定的协方差。"""
    orb = j.get("orbit") or {}
    cov = orb.get("covariance") or {}
    labels, data, epoch = cov.get("labels"), cov.get("data"), _as_float(cov.get("epoch"))
    if not isinstance(labels, list) or not isinstance(data, list) or epoch is None:
        return None
    try:
        matrix = [[float(v) for v in row] for row in data]
    except (TypeError, ValueError):
        log.warning("SBDB covariance %s: 矩阵格式异常", sstr)
        return None
    n = len(labels)
    if n == 0 or len(matrix) != n or any(len(row) != n for row in matrix):
        log.warning("SBDB covariance %s: 非方阵", sstr)
        return None
    obj = j.get("object") or {}
    signature = j.get("signature") or {}
    # covariance.elements 只在协方差历元与主轨道历元不同时保证返回；二者相同时
    # JPL 允许省略该数组，此时 orbit.elements 就是同解、同历元的中心值。
    # 只能在历元确实一致时回退，禁止把不同历元的根数塞进协方差中心。
    element_rows = cov.get("elements") or []
    orbit_epoch = _as_float(orb.get("epoch"))
    if not element_rows and orbit_epoch is not None and abs(orbit_epoch - epoch) < 1e-9:
        element_rows = orb.get("elements") or []
    elements: dict[str, float] = {}
    for item in element_rows:
        if not isinstance(item, dict) or item.get("label") is None:
            continue
        value = _as_float(item.get("value"))
        if value is not None:
            elements[str(item["label"])] = value
    return {
        "designation": obj.get("des", sstr),
        "orbit_solution_id": str(orb["orbit_id"]) if orb.get("orbit_id") is not None else None,
        "solution_epoch_tdb": orbit_epoch,
        "covariance_epoch_tdb": epoch,
        "labels": [str(x) for x in labels],
        "data": matrix,
        "elements": elements,
        "source_version": signature.get("version"),
    }


async def fetch_orbit_covariance(client: httpx.AsyncClient, sstr: str) -> dict | None:
    """取 SBDB 轨道解协方差矩阵，缺失协方差时返回 None。"""
    r = await client.get(SBDB_URL, params={
        "sstr": sstr, "cov": "mat", "full-prec": "true",
    })
    if r.status_code != 200:
        log.warning("SBDB covariance %s -> HTTP %d", sstr, r.status_code)
        return None
    return parse_orbit_covariance(r.json(), sstr)


async def fetch_orbit_bundle(
    client: httpx.AsyncClient, sstr: str,
) -> tuple[dict | None, dict | None]:
    """单次请求取同一 SBDB 轨道解的根数与协方差。

    数据入库时必须使用这个原子束；分两次请求会在 JPL 解更新的
    瞬间产生根数/协方差版本竞态。
    """
    r = await client.get(SBDB_URL, params={
        "sstr": sstr, "cov": "mat", "full-prec": "true",
    })
    if r.status_code != 200:
        log.warning("SBDB bundle %s -> HTTP %d", sstr, r.status_code)
        return None, None
    payload = r.json()
    return parse_sbdb(payload, sstr), parse_orbit_covariance(payload, sstr)


# ---------- JPL Sentry ----------

async def fetch_sentry_summaries(client: httpx.AsyncClient) -> tuple[list[dict], str | None]:
    """拉取 Sentry 当前对象汇总，不把对象不存在/已移除误判为零风险。"""
    r = await client.get(SENTRY_URL)
    r.raise_for_status()
    payload = r.json()
    signature = payload.get("signature") or {}
    out: list[dict] = []
    for item in payload.get("data") or []:
        des = item.get("des")
        if not des:
            continue
        out.append({
            "designation": str(des),
            "fullname": item.get("fullname"),
            "sentry_id": item.get("id"),
            "impact_probability": _as_float(item.get("ip")),
            "virtual_impactor_count": int(item["n_imp"]) if item.get("n_imp") is not None else None,
            "palermo_cum": _as_float(item.get("ps_cum")),
            "palermo_max": _as_float(item.get("ps_max")),
            "torino_max": int(item["ts_max"]) if item.get("ts_max") is not None else None,
            "vinf_kms": _as_float(item.get("v_inf")),
            "impact_range": item.get("range"),
            "last_obs": item.get("last_obs"),
            "source_version": signature.get("version"),
        })
    return out, signature.get("version")


# ---------- JPL CAD ----------

_MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


def _parse_cad_date(cd: str) -> str:
    """'2026-Aug-01 00:21' -> '2026-08-01T00:21:00'"""
    y, mon, rest = cd.split("-", 2)
    day, _, hm = rest.partition(" ")
    hh, mm = hm.split(":")
    return f"{y}-{_MONTHS[mon]:02d}-{int(day):02d}T{hh}:{mm}:00"


async def fetch_cad(client: httpx.AsyncClient, dist_max_ld: float = 20.0) -> list[dict]:
    """拉取今日起未来接近事件 (距离 <= ``dist_max_ld`` 个月球距离)。

    JPL CAD 的请求和响应距离单位均为 AU；数据库与事件 UI 统一使用 LD，
    所以两端都必须转换，不能把数值本身直接复用。
    """
    r = await client.get(CAD_URL, params={
        "date-min": date.today().isoformat(),
        "dist-max": dist_max_ld * LD_KM / AU_KM,
        "fullname": 1,
    })
    r.raise_for_status()
    j = r.json()
    fields = j.get("fields", [])
    idx = {name: i for i, name in enumerate(fields)}
    out: list[dict] = []
    for row in j.get("data", []):
        des, orbit_id = row[idx["des"]], row[idx["orbit_id"]]
        jd = float(row[idx["jd"]])
        h = float(row[idx["h"]]) if row[idx["h"]] else None
        out.append({
            "cd_id": f"{des}|{orbit_id}|{jd:.6f}",
            "designation": des,
            "fullname": (row[idx["fullname"]] or "").strip("() "),
            "date_iso": _parse_cad_date(row[idx["cd"]]),
            "jd": jd,
            "dist_ld": float(row[idx["dist"]]) * AU_KM / LD_KM,
            "dist_min_ld": float(row[idx["dist_min"]]) * AU_KM / LD_KM if row[idx["dist_min"]] else None,
            "dist_max_ld": float(row[idx["dist_max"]]) * AU_KM / LD_KM if row[idx["dist_max"]] else None,
            "v_rel_kms": float(row[idx["v_rel"]]) if row[idx["v_rel"]] else None,
            "h_mag": h,
            "diam_km": diam_from_h(h) if h is not None else None,
        })
    return out


# ---------- MPC MPCORB.DAT ----------

_CENTURY = {"I": 1800, "J": 1900, "K": 2000, "L": 2100}
_RE_A = re.compile(r"\s*(\d+\.\d+)")
# 可读编号兜底: '(1) Ceres' 或 '2014 KP4', 紧跟行尾 8 位末次观测日期之前
_RE_DES = re.compile(
    r"((?:\(\d+\)\s+)?(?:\d{4}\s+[A-Z]{1,3}\d{0,3}|[A-Za-z][A-Za-z\-]+))\s+\d{8}\s*$"
)
_PACKED_DAY = {str(d): d for d in range(1, 10)} | {
    chr(ord("A") + k): 10 + k for k in range(22)  # A..V = 10..31
}
_PACKED_MONTH = {str(m): m for m in range(1, 10)} | {"A": 10, "B": 11, "C": 12}


def jd_from_date(year: int, month: int, day_frac: float) -> float:
    """公历日期 (含小数日) -> 儒略日 (UT)。"""
    aa = (14 - month) // 12
    y2 = year + 4800 - aa
    m2 = month + 12 * aa - 3
    return (day_frac + (153 * m2 + 2) // 5 + 365 * y2
            + y2 // 4 - y2 // 100 + y2 // 400 - 32045.5)


def parse_mpcorb_epoch(s: str) -> float | None:
    """MPCORB 压缩历元: 世纪符 + 2位年 + 压缩月 + 压缩日 (共5字符)。"""
    if len(s) != 5 or s[0] not in _CENTURY:
        return None
    try:
        year = _CENTURY[s[0]] + int(s[1:3])
        month = _PACKED_MONTH[s[3]]
        day = _PACKED_DAY[s[4]]
    except (ValueError, KeyError):
        return None
    return jd_from_date(year, month, float(day))


def parse_mpcorb_line(line: str) -> dict | None:
    """固定列宽解析; 无解或格式异常返回 None。"""
    if len(line) < 109:
        return None
    try:
        h_mag = float(line[8:13])
        epoch_jd = parse_mpcorb_epoch(line[20:25].strip())
        m = float(line[26:35])
        w = float(line[37:46])
        om = float(line[48:57])
        inc = float(line[59:68])
        e = float(line[70:79])
        # a 字段自 92 列起右对齐; 不同时期文件尾随字段 (U/参考) 间距不一,
        # 用正则取首个数值, 避免切片侵入后续字段导致解析失败
        ma = _RE_A.match(line, 92)
        if ma is None:
            return None
        a = float(ma.group(1))
    except (ValueError, TypeError):
        return None
    if epoch_jd is None or a <= 0 or e < 0 or e >= 1:
        return None
    return {
        "a": a, "e": e, "i": inc, "om": om, "w": w,
        "m0": m0_to_j2000(m, epoch_jd, a),
        "epoch_jd": epoch_jd,
        "mag_h": h_mag,
        "designation": parse_mpcorb_identity(line),
    }


def parse_mpcorb_identity(line: str) -> str:
    """提取可读编号/名称 (如 '(1) Ceres' 或 '2014 KP4')。

    MPCORB 定宽格式中可读编号位于 166-193 列 (真实谷神星行已验证);
    切片为空时用正则兜底: 末次观测日期 (行尾 8 位数字) 前的编号模式。"""
    if len(line) >= 166:
        s = line[165:194].strip()
        if s:
            return s
    m = _RE_DES.search(line)
    return m.group(1).strip() if m else ""


def classify_orbit(a: float, e: float) -> str | None:
    """按根数粗略分类到云带族群; 不属于目标族群返回 None。"""
    q = a * (1.0 - e)
    if a >= 30.0:
        return "kuiper"
    if 4.6 <= a < 5.5 and q > 4.0:
        return "trojan"
    if 3.7 <= a < 4.2:
        return "hilda"
    if q < 1.3:
        return "neo"
    if 2.0 <= a < 3.55:
        return "main_belt"
    return None


class ReservoirSampler:
    """按族群配额的蓄水池抽样 (流式、单次遍历、内存 O(配额总和))。"""

    def __init__(self, quota: dict[str, int]):
        self.quota = quota
        self.pools: dict[str, list[dict]] = {k: [] for k in quota}
        self.seen: dict[str, int] = {k: 0 for k in quota}
        self.total = 0

    def offer(self, item: dict) -> None:
        self.total += 1
        pop = classify_orbit(item["a"], item["e"])
        if pop is None:
            return
        k = self.seen[pop] = self.seen[pop] + 1
        pool = self.pools[pop]
        cap = self.quota[pop]
        if len(pool) < cap:
            pool.append(item)
        else:
            j = random.randrange(k)
            if j < cap:
                pool[j] = item


async def _iter_mpcorb_lines(client: httpx.AsyncClient, total_size: int | None = None,
                             max_retries: int = 20, chunk: int = 12 * 1024 * 1024):
    """分段 Range 下载 MPCORB.DAT 并逐行产出。

    MPC 服务器会在长时间传输后主动断连, 但支持 Range 续传;
    跨段半行由前段尾部残片与下段首行拼接还原。
    """
    offset = 0
    retries = 0
    carry = ""  # 上一段的不完整尾行
    while True:
        headers = {"Range": f"bytes={offset}-{offset + chunk - 1}"}
        try:
            async with client.stream("GET", MPCORB_URL, headers=headers) as r:
                status = r.status_code
                body = (await r.aread()).decode("utf-8", errors="replace")
        except httpx.HTTPError as exc:
            retries += 1
            if retries > max_retries:
                raise
            wait = min(30.0, 3.0 * retries)
            log.warning("MPCORB 分段下载失败 (%s), %.0fs 后续传 offset=%d", exc, wait, offset)
            await asyncio.sleep(wait)
            continue
        if status not in (200, 206):
            raise httpx.HTTPStatusError(
                f"意外状态码 {status}", request=httpx.Request("GET", MPCORB_URL),
                response=httpx.Response(status))
        retries = 0
        if status == 200 and len(body) > chunk:
            # 服务器忽略 Range 返回整文件: 一次性处理完即止
            lines = body.split("\n")
            for i, ln in enumerate(lines[:-1]):
                yield (carry + ln if i == 0 else ln).rstrip("\r")
            return
        ends_nl = body.endswith("\n")
        lines = body.split("\n")
        if ends_nl:
            lines.pop()  # 末尾空串
            seg_tail = ""
        else:
            seg_tail = lines.pop()  # 不完整尾行并入下段
        consumed = False  # carry 是否已拼入某行
        for i, ln in enumerate(lines):
            if not consumed:
                ln = carry + ln  # 还原跨段半行
                consumed = True
            yield ln.rstrip("\r")
        offset += len(body)
        # 末段判定: 已到已知总长, 或 (总长未知时) 响应短于请求段长
        if (total_size is not None and offset >= total_size) or \
                (total_size is None and len(body) < chunk):
            if seg_tail:
                yield seg_tail if consumed else carry + seg_tail
            return
        carry = seg_tail


async def fetch_mpcorb(client: httpx.AsyncClient, quota: dict[str, int]) -> dict[str, list[dict]]:
    """分段下载 MPCORB.DAT 并按配额分层抽样, 返回 {population: [rows]}。"""
    try:
        total = int((await client.head(MPCORB_URL)).headers["content-length"])
    except (httpx.HTTPError, KeyError, ValueError):
        total = None  # HEAD 不可用时退化为按短响应判断结束
    sampler = ReservoirSampler(quota)
    n_rows = 0
    # 不用首字符过滤: 编号 >99999 用 '~' 压缩格式, 未编号天体以世纪符 (I/J/K/L)
    # 开头; 头部文本行均短于 109 字符, 由 parse_mpcorb_line 自身校验兼容
    async for line in _iter_mpcorb_lines(client, total_size=total):
        item = parse_mpcorb_line(line)
        if item is not None:
            n_rows += 1
            sampler.offer(item)
    log.info("MPCORB 解析 %d 行, 抽样 %s", n_rows,
             {k: len(v) for k, v in sampler.pools.items()})
    return sampler.pools
