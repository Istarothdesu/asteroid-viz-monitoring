"""名义地球遭遇状态到 B 平面的纯几何变换。

输入为日心黄道 J2000 中的地心相对位置/速度；先以地球二体近似回推双曲线
渐近线，再在垂直于入射 v∞ 的平面上给出 B 向量。该模块不计算撞击概率。
"""

import math

AU_KM = 149597870.7
MU_EARTH_KM3_S2 = 398600.435436
R_EARTH_KM = 6378.1363


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _scale(a, k):
    return tuple(x * k for x in a)


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _norm(a):
    return math.sqrt(_dot(a, a))


def _unit(a):
    n = _norm(a)
    if n == 0:
        raise ValueError("B 平面几何退化: 零向量")
    return _scale(a, 1 / n)


def bplane_from_relative_state(r_au, v_au_day) -> dict:
    """由地心相对状态计算入射 B 平面。

    返回的 ``xi/zeta`` 基于 ECLIPJ2000 北极定义；它是稳定渲染坐标系，
    不应与不同基准轴下的外部 B 平面图直接逐值比较。
    """
    r = _scale(r_au, AU_KM)
    v = _scale(v_au_day, AU_KM / 86400.0)
    r_mag = _norm(r)
    v2 = _dot(v, v)
    energy = v2 / 2 - MU_EARTH_KM3_S2 / r_mag
    if energy <= 0:
        raise ValueError("当前地心相对状态不是双曲线遭遇，无法定义 v∞ B 平面")
    vinf = math.sqrt(2 * energy)
    h = _cross(r, v)
    h_hat = _unit(h)
    e_vec = _sub(_scale(_cross(v, h), 1 / MU_EARTH_KM3_S2), _unit(r))
    e = _norm(e_vec)
    if e <= 1:
        raise ValueError("当前地心相对状态不是双曲线遭遇，无法定义 B 平面")
    p_hat = _unit(e_vec)
    q_hat = _cross(h_hat, p_hat)
    f_inf = math.acos(-1 / e)
    # 入射无穷远处位置方向；速度方向与该径向方向相反。
    r_in_hat = tuple(
        math.cos(-f_inf) * p_hat[k] + math.sin(-f_inf) * q_hat[k]
        for k in range(3)
    )
    s_hat = _scale(r_in_hat, -1)
    b_mag = _norm(h) / vinf
    b_vec = _scale(_unit(_cross(s_hat, h_hat)), b_mag)

    # 使用黄道北极固定 B 平面参考轴，近似平行时退化到黄道 Y 轴。
    ref = (0.0, 0.0, 1.0)
    if abs(_dot(s_hat, ref)) > 0.98:
        ref = (0.0, 1.0, 0.0)
    xi_hat = _unit(_cross(ref, s_hat))
    zeta_hat = _cross(s_hat, xi_hat)
    xi = _dot(b_vec, xi_hat)
    zeta = _dot(b_vec, zeta_hat)
    r_eff = R_EARTH_KM * math.sqrt(1 + 2 * MU_EARTH_KM3_S2 / (R_EARTH_KM * vinf * vinf))
    return {
        "xiKm": xi,
        "zetaKm": zeta,
        "bMagnitudeKm": b_mag,
        "vinfKms": vinf,
        "effectiveImpactRadiusKm": r_eff,
        "bVectorEclipticKm": list(b_vec),
        "incomingDirectionEcliptic": list(s_hat),
        "xiAxisEcliptic": list(xi_hat),
        "zetaAxisEcliptic": list(zeta_hat),
    }
