"""nbody.py 数值积分与星历插值的单元测试 (不联网、不依赖种子库)。"""
import math
import struct
from types import SimpleNamespace

import pytest

from nbody import (JD_J2000, PerturberField, grid_state, hermite, integrate,
                   kepler_state)

# 测试轨道: a=1.5 AU, e=0.2 椭圆 (键名对齐 kepler_state 形参)
EL = dict(a=1.5, e=0.2, i_deg=11.0, om_deg=80.0, w_deg=45.0, m0_deg=120.0)


def _two_body_field() -> PerturberField:
    """空摄动场 (gm_scale=0 时允许无表行) → 退化为纯二体, 可与解析解对拍。"""
    return PerturberField([], gm_scale=0.0)


def test_integrate_matches_kepler_forward():
    """二体退化: 前向积分 60 天端点 vs 解析 kepler_state, 误差 < 1e-7 AU。"""
    jd0 = JD_J2000 + 9000.0
    p0, v0 = kepler_state(**EL, jd=jd0)
    jds, states = integrate((*p0, *v0), jd0, jd0 + 60.0, _two_body_field(), 60.0)
    p1, _ = kepler_state(**EL, jd=jds[-1])
    assert math.dist(states[-1][:3], p1) < 1e-7


def test_integrate_backward():
    """反向积分 45 天同样吻合解析解。"""
    jd0 = JD_J2000 + 9000.0
    p0, v0 = kepler_state(**EL, jd=jd0)
    jds, states = integrate((*p0, *v0), jd0, jd0 - 45.0, _two_body_field(), 15.0)
    assert jds[0] == jd0 and jds[-1] == pytest.approx(jd0 - 45.0)
    p1, _ = kepler_state(**EL, jd=jds[-1])
    assert math.dist(states[-1][:3], p1) < 1e-7


def _synthetic_row() -> SimpleNamespace:
    """合成星历行: 1 AU 圆轨道, jd0 起日步长 4 点。"""
    jd0, step, count = JD_J2000, 1.0, 4
    omega = 0.01720209895  # rad/day (a=1)
    pos = struct.pack("<12d", *[
        v for k in range(count)
        for v in (math.cos(omega * k), math.sin(omega * k), 0.0)])
    vel = struct.pack("<12f", *[
        v for k in range(count)
        for v in (-omega * math.sin(omega * k), omega * math.cos(omega * k), 0.0)])
    return SimpleNamespace(body="t", designation="t", jd0=jd0, step_d=step,
                           count=count, pos=pos, vel=vel)


def test_hermite_and_grid_state():
    row = _synthetic_row()
    p = hermite(row, JD_J2000 + 1.5)
    assert math.dist(p, (math.cos(0.01720209895 * 1.5),
                         math.sin(0.01720209895 * 1.5), 0.0)) < 1e-6
    jd_g, s = grid_state(row, JD_J2000 + 2.4)
    assert jd_g == pytest.approx(JD_J2000 + 2.0)
    assert s[0] == pytest.approx(math.cos(0.01720209895 * 2), rel=1e-12)
    assert s[3] == pytest.approx(-0.01720209895 * math.sin(0.01720209895 * 2),
                                 rel=1e-6)  # vel 是 float32
    with pytest.raises(ValueError):
        hermite(row, JD_J2000 + 99)


def test_field_requires_planets_when_active():
    with pytest.raises(ValueError):
        PerturberField([], gm_scale=1.0)
