import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useCameraStore } from '@/store/cameraStore'
import { useFrameStore } from '@/store/frameStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useUIStore } from '@/store/uiStore'
import { SceneRuntimeState } from './SceneRuntimeState'

describe('SceneRuntimeState', () => {
  const initial = {
    camera: useCameraStore.getState(),
    frame: useFrameStore.getState(),
    selection: useSelectionStore.getState(),
    ui: useUIStore.getState(),
  }

  beforeEach(() => {
    useCameraStore.setState({ followRequest: false })
    useFrameStore.setState({ frame: 'helio', compIdx: 0, followSpin: false })
    useSelectionStore.setState({ selected: null, locked: false })
    useUIStore.setState({ mode: 'overview' })
  })

  afterEach(() => {
    useCameraStore.setState(initial.camera, true)
    useFrameStore.setState(initial.frame, true)
    useSelectionStore.setState(initial.selection, true)
    useUIStore.setState(initial.ui, true)
  })

  it('把跨 Store 状态组合成单帧场景快照', () => {
    useUIStore.setState({ mode: 'ground' })
    useSelectionStore.setState({ selected: { kind: 'station', idx: 2 } })
    useCameraStore.setState({ followRequest: true })

    const frame = new SceneRuntimeState().readFrame(2451545)
    expect(frame.groundMode).toBe(true)
    expect(frame.l1Mode).toBe(false)
    expect(frame.stationIndex).toBe(2)
    expect(frame.following).toBe(true)
  })

  it('集中执行拾取对应的选择与伴飞状态变更', () => {
    const runtime = new SceneRuntimeState()
    runtime.applyPickedTarget({ kind: 'ast', idx: 3 })
    expect(useSelectionStore.getState().selected).toEqual({ kind: 'ast', idx: 3 })
    expect(useFrameStore.getState().compIdx).toBe(3)

    useCameraStore.setState({ followRequest: true })
    runtime.applyPickedTarget(null)
    expect(useSelectionStore.getState().selected).toBeNull()
    expect(useCameraStore.getState().followRequest).toBe(false)

    useSelectionStore.setState({ selected: { kind: 'planet', idx: 2 }, locked: true })
    runtime.applyPickedTarget({ kind: 'ast', idx: 1 })
    expect(useSelectionStore.getState().selected).toEqual({ kind: 'planet', idx: 2 })
  })
})
