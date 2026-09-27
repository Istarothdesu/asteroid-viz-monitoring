import { TAU, D2R, R2D } from './constants'

export interface Vec3Like {
  x: number; y: number; z: number
  set(x: number, y: number, z: number): void
}

export function normAng(d: number): number {
  d %= 360
  return d < 0 ? d + 360 : d
}

export function keplerE(M: number, e: number): number {
  M %= TAU
  if (M > Math.PI) M -= TAU
  else if (M < -Math.PI) M += TAU
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 5; i++) {
    E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  }
  return E
}

export function posFromElements(
  a: number, e: number,
  iDeg: number, ODeg: number, wDeg: number,
  M: number,
  out: Vec3Like,
): Vec3Like {
  const E  = keplerE(M, e)
  const sq = Math.sqrt(1 - e * e)
  const xp = a * (Math.cos(E) - e)
  const yp = a * sq * Math.sin(E)

  const ci = Math.cos(iDeg * D2R), si = Math.sin(iDeg * D2R)
  const cO = Math.cos(ODeg * D2R), sO = Math.sin(ODeg * D2R)
  const cw = Math.cos(wDeg * D2R), sw = Math.sin(wDeg * D2R)

  const r00 = cO * cw - sO * sw * ci,  r01 = -cO * sw - sO * cw * ci
  const r10 = sO * cw + cO * sw * ci,  r11 = -sO * sw + cO * cw * ci
  const r20 = sw * si,                  r21 = cw * si

  out.set(r00 * xp + r01 * yp, r10 * xp + r11 * yp, r20 * xp + r21 * yp)
  return out
}

export { D2R, R2D }
