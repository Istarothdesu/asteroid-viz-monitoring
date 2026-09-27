import math
import struct
from types import SimpleNamespace

from bplane import AU_KM, bplane_from_relative_state
from risk_service import _bplane_from_arc, _state_from_covariance_elements, _uncertainty_tube


def test_bplane_has_expected_scale_for_hyperbolic_state():
    # 远离地球、近似沿 +X 入射，几何冲量参数约为 10,000 km。
    r_au = (-1_000_000 / AU_KM, 10_000 / AU_KM, 0.0)
    v_au_day = (12 * 86400 / AU_KM, 0.0, 0.0)
    out = bplane_from_relative_state(r_au, v_au_day)
    assert out["vinfKms"] > 11
    assert math.isclose(out["bMagnitudeKm"], 10_000, rel_tol=0.03)
    assert math.isclose(math.hypot(out["xiKm"], out["zetaKm"]), out["bMagnitudeKm"], rel_tol=1e-12)
    assert out["effectiveImpactRadiusKm"] > 6378


def test_sbdb_covariance_elements_convert_to_finite_state():
    state = _state_from_covariance_elements(
        # e, q(AU), tp(JD), node, peri, i
        [0.2, 0.9, 2451500.0, 80.0, 120.0, 5.0],
        2451600.0,
    )
    assert len(state) == 6
    assert all(math.isfinite(value) for value in state)


def test_sigma_arcs_compress_to_three_sigma_tube():
    nominal = {"points": [[2451545.0, 1.0, 2.0, 3.0], [2451546.0, 1.1, 2.0, 3.0]]}
    samples = []
    for dy, dz in ((1e-4, 0), (-1e-4, 0), (0, 2e-4), (0, -2e-4)):
        samples.append({"points": [[2451545.0, 1.0, 2.0 + dy, 3.0 + dz], [2451546.0, 1.1, 2.0 + dy, 3.0 + dz]]})
    tube = _uncertainty_tube(nominal, samples)
    assert tube["confidenceSigma"] == 3
    assert len(tube["sections"]) == 2
    assert tube["sections"][0]["radiusAAu"] > tube["sections"][0]["radiusBAu"] > 0
    tangent = (1.0, 0.0, 0.0)
    for axis in (tube["sections"][0]["axisAEcliptic"], tube["sections"][0]["axisBEcliptic"]):
        assert abs(sum(a * b for a, b in zip(axis, tangent))) < 1e-12


def test_bplane_refines_closest_time_between_output_samples():
    mid = 2451545.0
    zero_pos = struct.pack("<9d", *([0.0] * 9))
    zero_vel = struct.pack("<9f", *([0.0] * 9))
    earth = SimpleNamespace(
        body="earth", jd0=mid - 0.1, step_d=0.1, count=3,
        pos=zero_pos, vel=zero_vel,
    )
    speed = 12.0 * 86400.0 / AU_KM
    miss = 10_000.0 / AU_KM
    closest_offset = 0.003
    points = [
        [mid + offset, speed * (offset - closest_offset), miss, 0.0]
        for offset in (-0.01, 0.0, 0.01)
    ]
    out = _bplane_from_arc({"points": points}, earth, mid)
    assert abs(out["closestJd"] - (mid + closest_offset)) < 1e-8
    assert abs(out["closestDistanceKm"] - 10_000.0) < 1e-4
