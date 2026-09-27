"""N 体数值积分 (事件推演) 与共享轨道数学。

用途: 对单颗小行星的单个事件窗口做按需全摄动推演 (P1-1)。渲染链路永远
消费预计算数据, 本模块只在用户主动推演时被调用, 结果按窗口缓存。

力模型: 太阳点质量 + 八大行星 + 月球 (点质量, 位置由 planet_ephemeris 表
Hermite 插值, 内网离线可用 —— 该表随种子库下发)。未含主带大天体
(Ceres/Pallas/Vesta)、相对论、非引力项 (Yarkovsky 等) —— 对月~年尺度的
飞掠/交会事件推演足够; 撞击风险评估还需不确定度分析 (P2 范畴)。

初值: 优先取 asteroid_ephemeris 最近网格点的全摄动态; 未烘焙天体用 SBDB
全精度根数在历元时刻的密切状态 (开普勒六根数 → r,v, 本模块 kepler_state)。

时标: 全链路使用 TDB JD 均匀时标 (86400s/天), 与 JPL CAD/SBDB 及
bake_ephemeris.py 口径一致。
"""

import math
import struct

AU_KM = 149597870.7
KGAUSS = 0.01720209895  # AU^1.5/day (高斯引力常数, 与前端 constants.ts 一致)
MU_SUN = KGAUSS * KGAUSS  # AU^3/day^2
JD_J2000 = 2451545.0

_KM3S2_TO_AU3D2 = 86400.0 ** 2 / AU_KM ** 3

# (planet_ephemeris 表名, GM km^3/s^2, DE440 系)
# 火星及以外烘焙的是系统质心, GM 对应取系统值; 月球为地心相对坐标,
# 使用时叠加地球位置。来源: DE440 头文件 GM 常数。
PERTURBERS: tuple[tuple[str, float], ...] = (
    ("mercury", 22031.86855),
    ("venus", 324858.592),
    ("earth", 398600.4354),
    ("moon", 4902.8001),
    ("mars", 42828.3752),
    ("jupiter", 126712764.1),
    ("saturn", 37940585.2),
    ("uranus", 5794548.6),
    ("neptune", 6836527.1),
)


def hermite(row, jd: float) -> tuple[float, float, float]:
    """星历表行 (PlanetEphemeris/AsteroidEphemeris) 的三次 Hermite 插值,
    与前端 ephemeris.ts 同算法。"""
    k = (jd - row.jd0) / row.step_d
    if k < 0 or k > row.count - 1:
        name = getattr(row, "body", None) or getattr(row, "designation", "?")
        raise ValueError(f"jd {jd} 超出 {name} 星历覆盖区间")
    i = min(int(k), row.count - 2)
    u = k - i
    u2, u3 = u * u, u * u * u
    c00, c10 = 2 * u3 - 3 * u2 + 1, u3 - 2 * u2 + u
    c01, c11 = -2 * u3 + 3 * u2, u3 - u2
    pos = struct.unpack_from("<6d", row.pos, i * 24)
    vel = struct.unpack_from("<6f", row.vel, i * 12)
    h = row.step_d
    return tuple(
        c00 * pos[j] + c10 * h * vel[j] + c01 * pos[j + 3] + c11 * h * vel[j + 3]
        for j in range(3)
    )


def kepler_state(a: float, e: float, i_deg: float, om_deg: float, w_deg: float,
                 m0_deg: float, jd: float):
    """开普勒二体状态 (位置 AU, 速度 AU/day) — 前端 astPos 同链路,
    速度取解析式 (非数值差分), 与位置共用同一组旋转角。"""
    n = KGAUSS / (a * math.sqrt(a))
    M = (math.radians(m0_deg) + n * (jd - JD_J2000)) % (2 * math.pi)
    E = M + e * math.sin(M)
    for _ in range(8):
        E -= (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
    cE, sE = math.cos(E), math.sin(E)
    sq = math.sqrt(1 - e * e)
    xp, yp = a * (cE - e), a * sq * sE
    fac = n * a / (1 - e * cE)
    vxp, vyp = -fac * sE, fac * sq * cE
    i, om, w = math.radians(i_deg), math.radians(om_deg), math.radians(w_deg)
    cO, sO, cw, sw = math.cos(om), math.sin(om), math.cos(w), math.sin(w)
    ci, si = math.cos(i), math.sin(i)
    rot = (
        (cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci),
        (sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci),
        (sw * si, cw * si),
    )
    p = tuple(r[0] * xp + r[1] * yp for r in rot)
    v = tuple(r[0] * vxp + r[1] * vyp for r in rot)
    return p, v


def grid_state(row, jd: float) -> tuple[float, tuple]:
    """星历表行最近网格点的全摄动态: 返回 (网格点 jd, (x,y,z,vx,vy,vz))
    (AU, AU/day)。用作积分初值 —— 比历元根数更贴近真实轨道。"""
    k = min(max(round((jd - row.jd0) / row.step_d), 0), row.count - 1)
    pos = struct.unpack_from("<3d", row.pos, k * 24)
    vel = struct.unpack_from("<3f", row.vel, k * 12)
    return row.jd0 + k * row.step_d, (*pos, *vel)


class PerturberField:
    """由 planet_ephemeris 表行构成的摄动场: 给定 jd 返回各摄动体
    (日心黄道位置 AU, GM AU^3/day^2)。moon 行是地心相对坐标, 叠加地球。"""

    def __init__(self, rows, gm_scale: float = 1.0):
        by_name = {r.body: r for r in rows}
        self._earth = by_name.get("earth")
        self._items = []
        for name, gm_km in PERTURBERS:
            row = by_name.get(name)
            if row is None:
                continue
            self._items.append((name, row, gm_km * _KM3S2_TO_AU3D2 * gm_scale))
        if gm_scale > 0 and len(self._items) < 2:
            raise ValueError("planet_ephemeris 表为空, 无法构建摄动场")

    def positions(self, jd: float) -> list[tuple[float, ...]]:
        """返回 [(x, y, z, GM)]; 月球叠加地球位置转为日心。"""
        earth_p = None
        out = []
        for name, row, gm in self._items:
            p = hermite(row, jd)
            if name == "earth":
                earth_p = p
            out.append((p[0], p[1], p[2], gm))
        if earth_p is not None:
            for k, (name, row, gm) in enumerate(self._items):
                if name == "moon":
                    p = hermite(row, jd)
                    out[k] = (p[0] + earth_p[0], p[1] + earth_p[1],
                              p[2] + earth_p[2], gm)
        return out


def integrate(state0: tuple, jd0: float, jd1: float, field: PerturberField,
              step_out: float) -> tuple[list[float], list[tuple]]:
    """从 (jd0, state0) 积分到 jd1 (可反向), 按 step_out 天输出采样点。

    state0 = (x, y, z, vx, vy, vz), AU 与 AU/day, 日心黄道坐标。
    返回 (jds, [(x, y, z, vx, vy, vz)])。DOP853, rtol 1e-11。
    """
    from scipy.integrate import solve_ivp  # 延迟导入: 仅推演路径需要

    def rhs(_t, s):
        x, y, z = s[0], s[1], s[2]
        r3 = (x * x + y * y + z * z) ** 1.5
        ax, ay, az = -MU_SUN * x / r3, -MU_SUN * y / r3, -MU_SUN * z / r3
        for px, py, pz, gm in field.positions(_t):
            dx, dy, dz = px - x, py - y, pz - z
            d3 = (dx * dx + dy * dy + dz * dz) ** 1.5
            pr3 = (px * px + py * py + pz * pz) ** 1.5
            # 直接项 + 间接项 (摄动体对太阳的牵引)
            ax += gm * (dx / d3 - px / pr3)
            ay += gm * (dy / d3 - py / pr3)
            az += gm * (dz / d3 - pz / pr3)
        return (s[3], s[4], s[5], ax, ay, az)

    n_out = int(abs(jd1 - jd0) / step_out) + 1
    t_eval = [jd0 + math.copysign(k * step_out, jd1 - jd0) for k in range(n_out)]
    if t_eval[-1] != jd1:
        t_eval.append(jd1)
    sol = solve_ivp(rhs, (jd0, jd1), state0, method="DOP853",
                    t_eval=t_eval, rtol=1e-11, atol=1e-14, dense_output=False)
    if not sol.success:
        raise RuntimeError(f"积分失败: {sol.message}")
    return list(sol.t), [tuple(row) for row in sol.y.T]
