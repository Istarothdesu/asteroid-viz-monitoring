import { describe, expect, it } from 'vitest'
import { SimulationClock, type SimulationClockInput } from './SimulationClock'

const state = (patch: Partial<SimulationClockInput> = {}): SimulationClockInput => ({
  jd: 2460000,
  jdMin: 2459000,
  jdMax: 2461000,
  playing: false,
  playRate: 60,
  ...patch,
})

describe('SimulationClock', () => {
  it('keeps the paused store time as the live time', () => {
    const clock = new SimulationClock()
    expect(clock.tick(state(), 1 / 60)).toBe(2460000)
    expect(clock.liveJd.value).toBe(2460000)
  })

  it('advances in memory and preserves the precise time on pause', () => {
    const clock = new SimulationClock()
    clock.tick(state(), 1 / 60)
    const advanced = clock.tick(state({ playing: true }), 1 / 60)
    expect(advanced).toBeGreaterThan(2460000)
    expect(clock.tick(state({ playing: false }), 1 / 60)).toBe(advanced)
    expect(clock.justPaused).toBe(true)
  })

  it('accepts an external seek while playing', () => {
    const clock = new SimulationClock()
    clock.tick(state(), 1 / 60)
    clock.tick(state({ playing: true }), 1 / 60)
    const seeked = clock.tick(state({ jd: 2460010, playing: true }), 1 / 60)
    expect(seeked).toBeGreaterThan(2460010)
    expect(seeked).toBeLessThan(2460010.01)
  })

  it.each([false, true])('跳回起点，即使存储时刻未变也重新定位（播放=%s）', playing => {
    const clock = new SimulationClock()
    clock.tick(state(), 1 / 60)
    for (let i = 0; i < 60; i++) clock.tick(state({ playing: true }), 1 / 60)
    const reset = clock.tick(state({ playing, seekRevision: 1 }), 1 / 60)
    expect(reset - 2460000).toBeLessThan(2 / 86400)
    if (!playing) expect(reset).toBe(2460000)
  })

  it('clamps at the simulation boundary', () => {
    const clock = new SimulationClock()
    clock.tick(state({ jd: 2460000.9999, jdMax: 2460001 }), 1 / 60)
    expect(clock.tick(state({
      jd: 2460000.9999,
      jdMax: 2460001,
      playing: true,
      playRate: 3600,
    }), 1)).toBe(2460001)
    expect(clock.reachedBoundary).toBe(true)
  })
})
