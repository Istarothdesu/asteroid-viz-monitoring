import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { sampleNominalTrajectory } from './trajectory'

const trajectory = {
  points: [
    { jd: 10, centerEclipticAu: [0, 2, 4] as [number, number, number] },
    { jd: 20, centerEclipticAu: [10, 4, 8] as [number, number, number] },
    { jd: 30, centerEclipticAu: [20, 8, 16] as [number, number, number] },
  ],
}

describe('sampleNominalTrajectory', () => {
  it('interpolates the containing segment', () => {
    const out = new Vector3()
    expect(sampleNominalTrajectory(trajectory, 25, out)).toBe(true)
    expect(out.toArray()).toEqual([15, 6, 12])
  })

  it('accepts endpoints and rejects times outside the observation window', () => {
    const out = new Vector3()
    expect(sampleNominalTrajectory(trajectory, 10, out)).toBe(true)
    expect(out.toArray()).toEqual([0, 2, 4])
    expect(sampleNominalTrajectory(trajectory, 31, out)).toBe(false)
  })
})
