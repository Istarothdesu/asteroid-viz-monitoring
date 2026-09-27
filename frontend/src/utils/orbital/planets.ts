import { JD_J2000, D2R } from './constants'
import { normAng, posFromElements } from './kepler'
import { ephemPos } from './ephemeris'
import { MOON } from '@/data/planets'
import type { PlanetDef } from '@/types/orbital'
import type { Vec3Like } from './kepler'

/**
 * 行星日心黄道位置 (AU)。
 * 优先使用 SPICE 烘焙星历 (Hermite 插值, 误差 << 1 km); 星历未加载或超出
 * 覆盖区间时回退 JPL 简化长期根数表 (约 1800-2050 有效, 误差可达数千 km)。
 */
export function planetPos(pl: PlanetDef, jd: number, out: Vec3Like): Vec3Like {
  if (ephemPos(pl.en.toLowerCase(), jd, out)) return out
  const T = (jd - JD_J2000) / 36525
  const a = pl.a0 + pl.da * T
  const e = pl.e0 + pl.de * T
  const i = pl.i0 + pl.di * T
  const L = normAng(pl.L0 + pl.dL * T)
  const p = normAng(pl.p0 + pl.dp * T)
  const O = normAng(pl.O0 + pl.dO * T)
  const M = (L - p) * D2R
  const w = normAng(p - O)
  return posFromElements(a, e, i, O, w, M, out)
}

/**
 * 月球地心相对位置 (AU)。优先 SPICE 星历, 回退固定六根数线性外推。
 */
export function moonPosRel(jd: number, out: Vec3Like): Vec3Like {
  if (ephemPos('moon', jd, out)) return out
  return posFromElements(
    MOON.a,
    MOON.e,
    MOON.i,
    MOON.O,
    MOON.w,
    (MOON.M0 + MOON.nDeg * (jd - JD_J2000)) * D2R,
    out,
  )
}
