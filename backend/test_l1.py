from datetime import timezone

import numpy as np
import pytest
from astropy.time import Time
from fastapi.testclient import TestClient

from l1.reference import MU, SEED, jacobi, reference_packet
from l1.routes import time_axis
from main import app


def test_reference_contract_and_invariants():
    packet = reference_packet()
    orbit = packet["orbit"]
    states = np.array(orbit["samples"])
    assert states.shape == (2049, 6)
    assert np.allclose(states[0], SEED)
    assert np.linalg.norm(states[-1, :3] - states[0, :3]) < 1e-8
    assert np.max(np.abs(jacobi(states.T) - jacobi(states[0]))) < 1e-10
    assert np.min(np.linalg.norm(states[:, :3] - [1 - MU, 0, 0], axis=1)) > 0.005
    assert packet["profile"]["kind"] == "simulation"
    assert packet["profile"]["instrument"]["earthAvoidanceMarginDeg"] == 5.0
    assert orbit["periodDays"] == pytest.approx(177.4823103832)


@pytest.mark.parametrize("utc", ["2000-01-01T12:00:00", "2026-09-18T00:00:00", "2016-12-31T23:59:60"])
def test_utc_tdb_conversion(utc):
    client = TestClient(app)
    result = client.get("/api/l1/time", params={"utc_iso": utc}).json()
    expected = Time(utc, scale="utc")
    assert result["jdTdb"] == pytest.approx(expected.tdb.jd, abs=1e-9)
    reverse = client.get("/api/l1/time", params={"jd_tdb": result["jdTdb"]}).json()
    # 单浮点 JD 有约 40 微秒量化；ISO 输出毫秒精度。
    assert abs((Time(reverse["utcIso"].removesuffix("Z"), scale="utc") - expected).sec) < .001


def interpolate_axis(axis, jd):
    rows = axis["samples"]
    i = min(max(np.searchsorted([r[0] for r in rows], jd) - 1, 0), len(rows) - 2)
    a, b = rows[i:i + 2]
    jump = next((p for p in axis["leaps"] if a[0] <= p["startJdTdb"] and p["endJdTdb"] <= b[0]), None)
    if jump:
        assert not jump["startJdTdb"] <= jd < jump["endJdTdb"]
        knot = a if jd < jump["startJdTdb"] else b
        return knot[1] + (jd - knot[0]) * 86400000
    return a[1] + (b[1] - a[1]) * (jd - a[0]) / (b[0] - a[0])


@pytest.mark.parametrize("start", [2461290.5, 2457740.5])
def test_time_axis_accuracy_including_leap_day(start):
    axis = time_axis(start)
    # 检查整个窗口，包含闰秒当日而不仅是午夜。
    for jd in np.linspace(start, axis["endJdTdb"], 401):
        if any(p["startJdTdb"] <= jd < p["endJdTdb"] for p in axis["leaps"]):
            continue
        expected = Time(jd, format="jd", scale="tdb").utc.to_datetime(timezone=timezone.utc).timestamp() * 1000
        assert abs(interpolate_axis(axis, jd) - expected) < .2  # 毫秒


def test_reference_route_and_invalid_time():
    client = TestClient(app)
    assert client.get("/api/l1/reference").json()["profile"]["timeScale"] == "TDB"
    assert client.get("/api/l1/time").status_code == 422
    assert client.get("/api/l1/time", params={"utc_iso": "invalid"}).status_code == 422
