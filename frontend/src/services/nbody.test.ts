import { describe, it, expect } from 'vitest'
import { arcPositions, scanClosestApproach, type ArcPoint } from './nbody'
import { planetPos } from '@/utils/orbital/planets'
import { PLANETS } from '@/data/planets'
import { AU_KM, JD_J2000 } from '@/utils/orbital/constants'

describe('arcPositions', () => {
  it('平铺 xyz 列, 丢弃 jd 列', () => {
    const pos = arcPositions([
      [2450000, 1, 2, 3],
      [2450001, 4, 5, 6],
    ])
    expect(Array.from(pos)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('空点集返回空缓冲', () => {
    expect(arcPositions([]).length).toBe(0)
  })
})

describe('scanClosestApproach', () => {
  it('逐点地距取最小并给出对应时刻 (与点序无关)', () => {
    /* 构造两点: jd1 距地 0.01 AU, jd2 距地 0.02 AU → 最小取 jd1 */
    const earth = {
      x: 0,
      y: 0,
      z: 0,
      set(x: number, y: number, z: number) {
        this.x = x
        this.y = y
        this.z = z
      },
    }
    const jd1 = JD_J2000 + 100
    const jd2 = JD_J2000 + 200
    planetPos(PLANETS[2], jd1, earth)
    const p1: ArcPoint = [jd1, earth.x + 0.01, earth.y, earth.z]
    planetPos(PLANETS[2], jd2, earth)
    const p2: ArcPoint = [jd2, earth.x + 0.02, earth.y, earth.z]

    const r = scanClosestApproach([p2, p1])
    expect(r).not.toBeNull()
    expect(r!.jd).toBe(jd1)
    expect(r!.distKm).toBeCloseTo(0.01 * AU_KM, 3)
  })

  it('空点集返回 null', () => {
    expect(scanClosestApproach([])).toBeNull()
  })

  it('在相邻三点之间精化最近时刻，而不是停在粗网格点', () => {
    const earth = {
      x: 0, y: 0, z: 0,
      set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z },
    }
    const center = JD_J2000 + 100
    const closest = center + 0.3
    const speed = 0.01
    const miss = 0.001
    const points: ArcPoint[] = [-1, 0, 1].map((offset) => {
      const jd = center + offset
      planetPos(PLANETS[2], jd, earth)
      return [jd, earth.x + (jd - closest) * speed, earth.y + miss, earth.z]
    })
    const result = scanClosestApproach(points)!
    expect(result.jd).toBeCloseTo(closest, 5)
    expect(result.distKm).toBeCloseTo(miss * AU_KM, 2)
  })
})
