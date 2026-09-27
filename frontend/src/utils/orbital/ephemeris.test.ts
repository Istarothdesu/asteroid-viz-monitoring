import { describe, it, expect, afterEach } from 'vitest'
import { parseEphemeris, loadEphemeris, clearEphemeris, ephemPos, ephemEpoch } from './ephemeris'
import { planetPos } from './planets'
import { astPos } from './asteroids'
import { JD_J2000, TAU } from './constants'
import { PLANETS } from '@/data/planets'

class V3 {
  x = 0; y = 0; z = 0
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this }
  length() { return Math.hypot(this.x, this.y, this.z) }
}

const EARTH = PLANETS[2]
const DAY_YR = 365.25
const OMEGA = TAU / DAY_YR // rad/day, 合成测试用圆轨道

/** 构造单天体合成星历: 半径 1 AU 圆轨道, 日步长, count 个点, 起点 jd0 */
function buildCircleBuf(jd0: number, step: number, count: number, body = 'earth'): ArrayBuffer {
  const name = new TextEncoder().encode(body)
  const head = 2 + 2 + 1 + name.length + 8 + 8 + 4
  const buf = new ArrayBuffer(head + count * 24 + count * 12)
  const dv = new DataView(buf)
  let off = 0
  dv.setUint16(off, 1, true); off += 2
  dv.setUint16(off, 1, true); off += 2
  dv.setUint8(off, name.length); off += 1
  new Uint8Array(buf, off, name.length).set(name); off += name.length
  dv.setFloat64(off, jd0, true); off += 8
  dv.setFloat64(off, step, true); off += 8
  dv.setUint32(off, count, true); off += 4
  for (let k = 0; k < count; k++) {
    const th = OMEGA * k * step
    dv.setFloat64(off, Math.cos(th), true)
    dv.setFloat64(off + 8, Math.sin(th), true)
    dv.setFloat64(off + 16, 0, true)
    off += 24
  }
  for (let k = 0; k < count; k++) {
    const th = OMEGA * k * step
    dv.setFloat32(off, -OMEGA * Math.sin(th), true)
    dv.setFloat32(off + 4, OMEGA * Math.cos(th), true)
    dv.setFloat32(off + 8, 0, true)
    off += 12
  }
  return buf
}

afterEach(() => clearEphemeris())

describe('parseEphemeris', () => {
  it('round-trip: 元信息与采样点一致', () => {
    const map = parseEphemeris(buildCircleBuf(JD_J2000, 1, 11))
    const e = map.get('earth')!
    expect(e.jd0).toBe(JD_J2000)
    expect(e.step).toBe(1)
    expect(e.count).toBe(11)
    expect(e.pos[0]).toBeCloseTo(1, 12)      // k=0: cos(0)
    expect(e.pos[3]).toBeCloseTo(Math.cos(OMEGA), 12) // k=1
    expect(e.vel[0]).toBeCloseTo(0, 6)       // vx = -ω sin(0)
  })

  it('拒绝未知版本', () => {
    const buf = buildCircleBuf(JD_J2000, 1, 4)
    new DataView(buf).setUint16(0, 99, true)
    expect(() => parseEphemeris(buf)).toThrow()
  })
})

describe('ephemPos (Hermite)', () => {
  it('日步长圆轨道中点插值误差 < 1e-6 AU', () => {
    loadEphemeris(buildCircleBuf(JD_J2000, 1, 40))
    const out = new V3()
    expect(ephemPos('earth', JD_J2000 + 10.5, out)).toBe(true)
    const th = OMEGA * 10.5
    expect(Math.hypot(out.x - Math.cos(th), out.y - Math.sin(th), out.z)).toBeLessThan(1e-6)
  })

  it('未加载 / 未知天体 / 超出覆盖区间均返回 false (调用方回退)', () => {
    const out = new V3()
    expect(ephemPos('earth', JD_J2000, out)).toBe(false)
    loadEphemeris(buildCircleBuf(JD_J2000, 1, 10))
    expect(ephemPos('mars', JD_J2000, out)).toBe(false)
    expect(ephemPos('earth', JD_J2000 - 0.5, out)).toBe(false)
    expect(ephemPos('earth', JD_J2000 + 10, out)).toBe(false)
  })

  it('load/clear 均推进装载代次 (采样缓存键失效契约)', () => {
    const e0 = ephemEpoch()
    loadEphemeris(buildCircleBuf(JD_J2000, 1, 10))
    const e1 = ephemEpoch()
    expect(e1).toBeGreaterThan(e0)
    clearEphemeris()
    expect(ephemEpoch()).toBeGreaterThan(e1)
  })
})

describe('planetPos 接入星历', () => {
  it('星历加载后 planetPos 走插值而非简化根数表', () => {
    loadEphemeris(buildCircleBuf(JD_J2000, 1, 40))
    const p = new V3()
    planetPos(EARTH, JD_J2000 + 20, p)
    expect(p.length()).toBeCloseTo(1, 10) // 圆轨道恒为 1 AU, 根数表则 ~0.983-1.017
  })

  it('清空后回退根数表 (J2000 距日 ~0.983 AU)', () => {
    loadEphemeris(buildCircleBuf(JD_J2000, 1, 40))
    clearEphemeris()
    const p = new V3()
    planetPos(EARTH, JD_J2000, p)
    expect(Math.abs(p.length() - 0.983)).toBeLessThan(0.005)
  })
})

describe('astPos 接入小行星星历', () => {
  /* 根数 a=2 (J2000 距日 ~2 AU) vs 星历 1 AU 圆轨道, 两者可区分走哪条路 */
  const EL = { a: 2, e: 0, i: 0, O: 0, w: 0, M0: 0 }

  it('des 命中星历时走插值', () => {
    loadEphemeris(buildCircleBuf(JD_J2000, 1, 40, '99942'))
    const p = astPos({ ...EL, des: '99942' }, JD_J2000 + 20.5, new V3())
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 6)
  })

  it('无 des 或 des 未命中时回退开普勒', () => {
    loadEphemeris(buildCircleBuf(JD_J2000, 1, 40, '99942'))
    const p1 = astPos(EL, JD_J2000 + 20.5, new V3())
    expect(Math.hypot(p1.x, p1.y, p1.z)).toBeCloseTo(2, 6)
    const p2 = astPos({ ...EL, des: '433' }, JD_J2000 + 20.5, new V3())
    expect(Math.hypot(p2.x, p2.y, p2.z)).toBeCloseTo(2, 6)
  })

  it('超出星历覆盖区间时回退开普勒', () => {
    loadEphemeris(buildCircleBuf(JD_J2000, 1, 40, '99942'))
    const p = astPos({ ...EL, des: '99942' }, JD_J2000 + 100, new V3())
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(2, 6)
  })
})
