import { describe, it, expect } from 'vitest'
import {
  keplerE, posFromElements,
  D2R, R2D,
} from './kepler'
import { planetPos } from './planets'
import { meanMotionDeg } from './asteroids'
import { astPos } from './asteroids'
import { fitEncounter } from './fitEncounter'
import { nowJD } from './time'
import { AU_KM, JD_J2000, KGAUSS } from './constants'
import { PLANETS } from '@/data/planets'
import { ASTEROIDS } from '@/data/asteroids'

// Minimal Vec3 for tests (no Three.js dependency)
class V3 {
  x: number; y: number; z: number
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this }
  length() { return Math.hypot(this.x, this.y, this.z) }
  distanceToSquared(v: V3) {
    const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z
    return dx * dx + dy * dy + dz * dz
  }
  sub(v: V3) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this }
  normalize() { const l = this.length(); this.x /= l; this.y /= l; this.z /= l; return this }
  dot(v: V3) { return this.x * v.x + this.y * v.y + this.z * v.z }
  copy(v: V3) { this.x = v.x; this.y = v.y; this.z = v.z; return this }
}

const EARTH = PLANETS[2]  // Earth is index 2

describe('keplerE', () => {
  it('solves M=0 → E=0', () => {
    expect(keplerE(0, 0.5)).toBeCloseTo(0, 10)
  })

  it('round-trip: E - e*sin(E) == M', () => {
    const M = 1.2, e = 0.3
    const E = keplerE(M, e)
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 8)
  })

  it('high eccentricity e=0.9', () => {
    const M = 0.5, e = 0.9
    const E = keplerE(M, e)
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 6)
  })
})

describe('Earth position (JPL elements)', () => {
  it('heliocentric distance at J2000 ≈ 0.983 AU (near perihelion Jan 1)', () => {
    const p = new V3(); planetPos(EARTH, JD_J2000, p)
    expect(Math.abs(p.length() - 0.983)).toBeLessThan(0.005)
  })

  it('autumn equinox 2024-09-22: Earth heliocentric longitude ≈ 0°', () => {
    const jd = Date.parse('2024-09-22T12:00:00Z') / 86400000 + 2440587.5
    const p = new V3(); planetPos(EARTH, jd, p)
    const lon = Math.atan2(p.y, p.x) * R2D
    expect(Math.abs(lon)).toBeLessThan(2.0)
  })
})

describe('meanMotionDeg', () => {
  it('Earth ~0.9856 deg/day', () => {
    const n = meanMotionDeg(1.0)
    expect(Math.abs(n - 0.9856)).toBeLessThan(0.001)
  })

  it('Halley comet-like (a=17.8): slower than Earth', () => {
    expect(meanMotionDeg(17.8)).toBeLessThan(0.1)
  })
})

describe('nowJD', () => {
  it('is close to current Julian Date (~2460000)', () => {
    const jd = nowJD()
    expect(jd).toBeGreaterThan(2451545)  // > J2000
    expect(jd).toBeLessThan(2500000)     // before 2132
  })
})

describe('fitEncounter residuals', () => {
  const EVENTS = [
    { id: 'tunguska',    date: '1908-06-30T00:14:00Z', type: 'impact' as const, el: { a: 1.60, e: 0.45, i: 6.0, O: 340.0, w: 100.0 } },
    { id: 'tc3',         date: '2008-10-07T02:46:00Z', type: 'impact' as const, el: { a: 1.308, e: 0.312, i: 2.542, O: 194.10, w: 234.45 } },
    { id: 'chelyabinsk', date: '2013-02-15T03:20:00Z', type: 'impact' as const, el: { a: 1.76, e: 0.57, i: 3.82, O: 326.46, w: 109.67 } },
    { id: 'ok2019',      date: '2019-07-25T01:22:00Z', type: 'flyby' as const, missKm: 72000, off: [-0.4, 0.1, -0.91] as [number, number, number], el: { a: 1.947, e: 0.762, i: 1.40, O: 302.09, w: 104.13 } },
    { id: 'apophis',     date: '2029-04-13T21:46:00Z', type: 'flyby' as const, missKm: 38000, off: [0.15, -0.35, 0.92] as [number, number, number], el: { a: 0.9225, e: 0.1915, i: 3.331, O: 204.05, w: 126.40 } },
  ]

  for (const ev of EVENTS) {
    it(`${ev.id}: position residual < 100 km`, () => {
      const jdEnc = Date.parse(ev.date) / 86400000 + 2440587.5
      const earth = planetPos(EARTH, jdEnc, new V3())
      const target = new V3(earth.x, earth.y, earth.z)

      if (ev.type === 'flyby' && 'off' in ev) {
        const norm = Math.hypot(...ev.off)
        target.x += ev.off[0] / norm * ev.missKm / AU_KM
        target.y += ev.off[1] / norm * ev.missKm / AU_KM
        target.z += ev.off[2] / norm * ev.missKm / AU_KM
      }

      const result = fitEncounter(ev.el, jdEnc, target, () => new V3())
      expect(result).not.toBeNull()

      const got = new V3()
      const Menc_approx = (result!.M0 + meanMotionDeg(result!.a) * (jdEnc - JD_J2000)) * D2R
      posFromElements(result!.a, result!.e, result!.i, result!.O, result!.w, Menc_approx, got)

      const residKm = Math.sqrt(got.distanceToSquared(target)) * AU_KM
      expect(residKm).toBeLessThan(100)
    })
  }
})

describe('two-body energy invariant (JS 传播链自洽性)', () => {
  // 比轨道能量 ε = v²/2 − μ/r 是二体问题的运动常数, 必须恒等于 −μ/(2a);
  // 速度用中心差分数值求得, 对 astPos 全链路 (M 外推 + 解开普勒方程 + 旋转) 做端到端校验
  const MU = KGAUSS * KGAUSS
  for (const ast of ASTEROIDS.slice(0, 8)) {
    it(`${ast.en}: ε ≡ −μ/2a (相对偏差 < 1e-6)`, () => {
      const h = 0.005 // 天
      for (const jd of [JD_J2000 - 3652.5, JD_J2000, JD_J2000 + 3652.5]) {
        const p0 = astPos(ast, jd - h, new V3())
        const p1 = astPos(ast, jd + h, new V3())
        const p = astPos(ast, jd, new V3())
        const vx = (p1.x - p0.x) / (2 * h)
        const vy = (p1.y - p0.y) / (2 * h)
        const vz = (p1.z - p0.z) / (2 * h)
        const eps = (vx * vx + vy * vy + vz * vz) / 2
          - MU / Math.hypot(p.x, p.y, p.z)
        const expectEps = -MU / (2 * ast.a)
        expect(Math.abs(eps - expectEps) / Math.abs(expectEps)).toBeLessThan(1e-6)
      }
    })
  }
})

describe('Kepler solver performance', () => {
  it('13,000 solves complete in < 50ms', () => {
    const N = 13000, t = 8000
    const arr = new Float64Array(N * 3)
    for (let k = 0; k < N; k++) {
      arr[k * 3]     = 1.5 + (k / N) * 3
      arr[k * 3 + 1] = (k % 100) / 200
      arr[k * 3 + 2] = (k / N) * Math.PI * 2
    }
    const t0 = performance.now()
    let sink = 0
    for (let k = 0; k < N; k++) {
      const a = arr[k * 3], e = arr[k * 3 + 1]
      const M = arr[k * 3 + 2] + KGAUSS / (a * Math.sqrt(a)) * t
      const E = keplerE(M, e)
      sink += a * (Math.cos(E) - e)
    }
    const ms = performance.now() - t0
    expect(sink).not.toBeNaN()
    expect(ms).toBeLessThan(50)
  })
})
