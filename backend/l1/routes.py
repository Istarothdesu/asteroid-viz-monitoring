from datetime import datetime, timedelta, timezone

import erfa
from astropy.time import Time
from fastapi import APIRouter, HTTPException, Query

from l1.reference import reference_packet

router = APIRouter(prefix="/api/l1", tags=["L1 仿真"])


@router.get("/reference")
def reference():
    return reference_packet()


@router.get("/time")
def convert_time(utc_iso: str | None = None, jd_tdb: float | None = None):
    if (utc_iso is None) == (jd_tdb is None):
        raise HTTPException(422, "必须且只能指定 UTC ISO 时刻或 TDB 儒略日")
    try:
        t = Time(utc_iso.removesuffix("Z"), format="isot", scale="utc") if utc_iso is not None else Time(jd_tdb, format="jd", scale="tdb")
    except ValueError as exc:
        raise HTTPException(422, "无效时刻") from exc
    return {"jdTdb": float(t.tdb.jd), "utcIso": t.utc.isot + "Z",
            "source": "Astropy Time / ERFA"}


@router.get("/time-axis")
def time_axis(start_jd_tdb: float = Query(ge=2441318.5, le=2488069.5)):
    """96 天分段映射，覆盖当前时刻前后任务窗口；闰秒不在插值中摊平。"""
    end = start_jd_tdb + 96
    epochs = {start_jd_tdb + k / 4 for k in range(385)}
    leaps = []
    previous = None
    for entry in erfa.leap_seconds.get():
        offset = float(entry["tai_utc"])
        if previous is not None and offset - previous == 1:
            midnight = datetime(int(entry["year"]), int(entry["month"]), 1)
            stop = float(Time(midnight, scale="utc").tdb.jd)
            begin = stop - 1 / 86400
            if begin <= end and stop >= start_jd_tdb:
                # JD 单浮点有约 40 微秒量化误差；采样点避开闰秒边界。
                epochs.update([begin - 1 / 86400, stop + 1 / 86400])
                leaps.append({"startJdTdb": begin, "endJdTdb": stop,
                              "label": (midnight - timedelta(days=1)).strftime("%Y-%m-%d") + " 23:59:60 UTC"})
        previous = offset
    samples = []
    for jd in sorted(epochs):
        if any(item["startJdTdb"] <= jd <= item["endJdTdb"] for item in leaps):
            continue
        utc = Time(jd, format="jd", scale="tdb").utc.to_datetime(timezone=timezone.utc)
        samples.append([jd, utc.timestamp() * 1000])
    return {"startJdTdb": start_jd_tdb, "endJdTdb": end, "samples": samples,
            "leaps": leaps, "source": "Astropy Time / ERFA",
            "assumption": "未来 UTC 沿用库内闰秒表，不预测未来闰秒"}
