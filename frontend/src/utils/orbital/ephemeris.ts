/**
 * 预计算星历 (SPICE 烘焙) 的解析与插值。
 *
 * 数据来源: 后端 /api/ephemeris (planet_ephemeris 表由 bake_ephemeris.py 经
 * de440s 烘焙; asteroid_ephemeris 表由 bake_asteroid_ephemeris.py 经 Horizons
 * 烘焙, 键为 SBDB designation)。采样点含位置 + 速度, 两点间用三次 Hermite
 * 插值, 误差 << 1 km, 替代原 JPL 简化长期根数表 (地球误差可达数千 km)
 * 与开普勒二体外推 (小行星离历元数年误差可达百万 km)。
 *
 * 降级口径与全项目一致: 后端不可达 / 表为空 / 查询超出覆盖区间时,
 * 调用方静默回退到简化根数表 (见 planets.ts)。
 */
import type { Vec3Like } from './kepler'

export interface EphemBody {
  jd0: number
  step: number
  count: number
  /** float64 xyz 交错, AU */
  pos: Float64Array
  /** float32 xyz 交错, AU/day */
  vel: Float32Array
}

let bodies: Map<string, EphemBody> | null = null
/* 装载代次: 每次 load/clear 自增, 轨道线等"按 jd 缓存采样"的消费方
   须把本值并入缓存键 —— 星历到位后位置源从简化根数切换到 SPICE,
   仅凭 jd 的旧键会让缓存的几何停留在回退源上 (月球轨道面偏差最大) */
let epoch = 0

/** 解析 /api/ephemeris 二进制流 (线格式见后端 main.py get_ephemeris 注释) */
export function parseEphemeris(buf: ArrayBuffer): Map<string, EphemBody> {
  const dv = new DataView(buf)
  let off = 0
  const version = dv.getUint16(off, true); off += 2
  if (version !== 1) throw new Error(`未知星历格式版本: ${version}`)
  const nbody = dv.getUint16(off, true); off += 2
  const map = new Map<string, EphemBody>()
  for (let b = 0; b < nbody; b++) {
    const nameLen = dv.getUint8(off); off += 1
    const name = new TextDecoder().decode(new Uint8Array(buf, off, nameLen))
    off += nameLen
    const jd0 = dv.getFloat64(off, true); off += 8
    const step = dv.getFloat64(off, true); off += 8
    const count = dv.getUint32(off, true); off += 4
    const pos = new Float64Array(buf.slice(off, off + count * 24)); off += count * 24
    const vel = new Float32Array(buf.slice(off, off + count * 12)); off += count * 12
    map.set(name, { jd0, step, count, pos, vel })
  }
  return map
}

/** 装载星历数据 (dataStore 初始化时调用一次) */
export function loadEphemeris(buf: ArrayBuffer): void {
  bodies = parseEphemeris(buf)
  epoch += 1
}

/** 清空星历 (测试用) */
export function clearEphemeris(): void {
  bodies = null
  epoch += 1
}

export function ephemLoaded(): boolean {
  return bodies !== null
}

/** 星历装载代次: 随 load/clear 自增, 供采样缓存键失效用 */
export function ephemEpoch(): number {
  return epoch
}

/**
 * Hermite 插值取天体位置; 成功返回 true, 未加载/超区间返回 false (调用方回退)。
 * body: 小写英文名 ("earth" / "moon" ...), jd: TDB 儒略日, out: 输出 AU。
 */
export function ephemPos(body: string, jd: number, out: Pick<Vec3Like, 'x' | 'y' | 'z'>): boolean {
  const e = bodies?.get(body)
  if (!e) return false
  const k = (jd - e.jd0) / e.step
  if (k < 0 || k > e.count - 1) return false
  const i = Math.min(Math.floor(k), e.count - 2)
  const u = k - i
  const u2 = u * u
  const u3 = u2 * u
  const c00 = 2 * u3 - 3 * u2 + 1
  const c10 = u3 - 2 * u2 + u
  const c01 = -2 * u3 + 3 * u2
  const c11 = u3 - u2
  const h = e.step
  const p = e.pos, v = e.vel, i3 = i * 3
  out.x = c00 * p[i3]     + c10 * h * v[i3]     + c01 * p[i3 + 3] + c11 * h * v[i3 + 3]
  out.y = c00 * p[i3 + 1] + c10 * h * v[i3 + 1] + c01 * p[i3 + 4] + c11 * h * v[i3 + 4]
  out.z = c00 * p[i3 + 2] + c10 * h * v[i3 + 2] + c01 * p[i3 + 5] + c11 * h * v[i3 + 5]
  return true
}

/** 与位置共用 Hermite 曲线的解析速度，单位 AU/day；不做静默降级。 */
export function ephemState(body: string, jd: number, position: Pick<Vec3Like, 'x' | 'y' | 'z'>, velocity: Pick<Vec3Like, 'x' | 'y' | 'z'>): boolean {
  if (!ephemPos(body, jd, position)) return false
  const e = bodies!.get(body)!
  const k = (jd - e.jd0) / e.step
  const i = Math.min(Math.floor(k), e.count - 2), u = k - i
  const d00 = (6 * u * u - 6 * u) / e.step
  const d01 = -d00, d10 = 3 * u * u - 4 * u + 1, d11 = 3 * u * u - 2 * u
  const j = i * 3, p = e.pos, v = e.vel
  velocity.x = d00 * p[j] + d01 * p[j + 3] + d10 * v[j] + d11 * v[j + 3]
  velocity.y = d00 * p[j + 1] + d01 * p[j + 4] + d10 * v[j + 1] + d11 * v[j + 4]
  velocity.z = d00 * p[j + 2] + d01 * p[j + 5] + d10 * v[j + 2] + d11 * v[j + 5]
  return true
}
