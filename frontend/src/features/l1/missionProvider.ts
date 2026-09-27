import {
  getObservationPlan as getLocalObservationPlan,
  getObservationPlayback as getLocalObservationPlayback,
  getPlanError as getLocalPlanError,
} from './planRuntime'
import {
  getL1ObserverState as getLocalObserverState,
  getL1Reference as getLocalReference,
  mapSynodicPosition,
  synodicState,
} from './runtime'
import type { PreparedPlan } from './observationPlan'
import type { L1Reference, ObserverState, Vector } from './types'

export type ObservationPlayback = ReturnType<typeof getLocalObservationPlayback>

/**
 * L1 任务数据端口。当前实现读取本地 CR3BP 仿真与模拟计划；未来接入轨道、
 * 姿态或计划分系统时，只替换本端口，不修改页面与 Three.js 渲染器。
 */
export interface L1MissionProvider {
  readonly id: string
  getReference(): L1Reference | null
  getObserverState(jdTdb: number): ObserverState | null
  getObservationPlan(jdTdb: number): PreparedPlan | null
  getObservationPlayback(jdTdb: number): ObservationPlayback
  getPlanError(): string
  sampleReferenceOrbit(jdTdb: number, segments: number): Vector[] | null
}

const localSimulationProvider: L1MissionProvider = {
  id: 'local-l1-simulation',
  getReference: getLocalReference,
  getObserverState: getLocalObserverState,
  getObservationPlan: getLocalObservationPlan,
  getObservationPlayback: getLocalObservationPlayback,
  getPlanError: getLocalPlanError,
  sampleReferenceOrbit(jdTdb, segments) {
    const observer = getLocalObserverState(jdTdb)
    const reference = getLocalReference()
    if (!observer || !reference || segments < 1) return null
    const points: Vector[] = []
    for (let index = 0; index <= segments; index++) {
      const state = synodicState(
        jdTdb + index / segments * reference.orbit.periodDays,
        reference,
      )
      if (!state) return null
      points.push(mapSynodicPosition(state, observer.earthPositionAu, observer.basis, reference))
    }
    return points
  },
}

let activeProvider = localSimulationProvider

export function setL1MissionProvider(provider: L1MissionProvider): void {
  activeProvider = provider
}

export function resetL1MissionProvider(): void {
  activeProvider = localSimulationProvider
}

export function getL1MissionProvider(): L1MissionProvider {
  return activeProvider
}

export function getL1MissionSnapshot(jdTdb: number, includePlayback = true) {
  const provider = activeProvider
  return {
    providerId: provider.id,
    jdTdb,
    reference: provider.getReference(),
    observer: provider.getObserverState(jdTdb),
    playback: includePlayback ? provider.getObservationPlayback(jdTdb) : null,
  }
}
