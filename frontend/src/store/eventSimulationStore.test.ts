import { afterEach, describe, expect, it } from 'vitest'
import { captureTopicTime, useEventSimulationStore } from './eventSimulationStore'
import { useSimStore } from './simStore'
import { useFrameStore } from './frameStore'
import { useSelectionStore } from './selectionStore'
import { useCameraStore } from './cameraStore'
import { useLayerStore } from './layerStore'
import type { EventRecord } from '@/types/scene'

const event = {
  id: 'land', name: '测试落点', type: 'impact', dateUTC: '2026-09-22T06:00:00Z',
  diam: .05, impactLon: 91.8, impactLat: 32.2,
} as EventRecord

afterEach(() => useEventSimulationStore.getState().stopSimulation())

describe('事件仿真会话', () => {
  it('切换演示后退出，恢复专题时刻、范围、参考系、选择和跟随，保留图层', () => {
    useSimStore.setState({ jd: 2461300, jdMin: 2461299, jdMax: 2461301,
      playing: false, playRate: 60, timelineScaleDays: 2, timelineCenterJd: 2461300 })
    useFrameStore.getState().setFrame('helio')
    useSelectionStore.getState().setSelected({ kind: 'event', idx: 0 })
    useCameraStore.getState().setFollowRequest(true)
    const layers = useLayerStore.getState()
    const simulation = useEventSimulationStore.getState()
    simulation.startSimulation(event)
    captureTopicTime(2461300.25)
    simulation.selectScenario('arizona')
    simulation.selectScenario('plateau')
    useSimStore.setState({ jd: 2461306, jdMin: 2461305, jdMax: 2461307, playing: true, playRate: .45 })
    simulation.stopSimulation()
    expect(useSimStore.getState()).toMatchObject({ jd: 2461300.25, jdMin: 2461299, jdMax: 2461301,
      playing: false, playRate: 60, timelineScaleDays: 2, timelineCenterJd: 2461300 })
    expect(useFrameStore.getState().frame).toBe('helio')
    expect(useSelectionStore.getState().selected).toEqual({ kind: 'event', idx: 0 })
    expect(useCameraStore.getState().followRequest).toBe(true)
    expect(useLayerStore.getState()).toBe(layers)
    expect(useEventSimulationStore.getState()).toMatchObject({ activeEvent: null, session: null, config: null })
  })

  it('空爆事件保持未接入状态，只有主动选择演示才准备陆地撞击', () => {
    const simulation = useEventSimulationStore.getState()
    simulation.startSimulation({ ...event, burstAltKm: 8 })
    expect(useEventSimulationStore.getState()).toMatchObject({ config: null, preparation: 'unsupported' })
    expect(useSimStore.getState().playing).toBe(false)
    simulation.selectScenario('arizona')
    expect(useEventSimulationStore.getState()).toMatchObject({ config: { id: 'arizona' }, preparation: 'loading' })
    simulation.selectScenario('event')
    expect(useEventSimulationStore.getState()).toMatchObject({ config: null, session: null, preparation: 'unsupported' })
  })
})
