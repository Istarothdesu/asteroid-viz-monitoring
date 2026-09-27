import { D2R, TAU } from './constants'

/**
 * 采样标准椭圆轨道的局部几何 (焦点在原点, 无平移/帧旋转), 361 点写入 arr。
 * 局部几何只由根数决定 —— 调用方缓存后自行叠加平移/旋转 (见 OrbitRenderer),
 * 使"根数未变的重采样"与"中心/旋转未变的坐标变换"都可以各自跳过。
 */
export function sampleEllipse(
  arr: Float32Array,
  a: number, e: number,
  i: number, O: number, w: number,
): void {
  const p  = a * (1 - e * e)
  const ci = Math.cos(i * D2R), si = Math.sin(i * D2R)
  const cO = Math.cos(O * D2R), sO = Math.sin(O * D2R)
  const cw = Math.cos(w * D2R), sw = Math.sin(w * D2R)
  const r00 = cO * cw - sO * sw * ci,  r01 = -cO * sw - sO * cw * ci
  const r10 = sO * cw + cO * sw * ci,  r11 = -sO * sw + cO * cw * ci
  const r20 = sw * si,                  r21 = cw * si

  for (let k = 0; k <= 360; k++) {
    const nu = k / 360 * TAU
    const r  = p / (1 + e * Math.cos(nu))
    const xp = r * Math.cos(nu), yp = r * Math.sin(nu)
    arr[3 * k]     = r00 * xp + r01 * yp
    arr[3 * k + 1] = r10 * xp + r11 * yp
    arr[3 * k + 2] = r20 * xp + r21 * yp
  }
}
