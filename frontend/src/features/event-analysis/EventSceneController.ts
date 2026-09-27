import {
  fetchLocalBPlaneUncertainty,
  fetchNominalBPlane,
  propagateArc,
  type LocalBPlaneUncertainty,
  type NominalBPlane,
} from '@/api/client'
import { useSceneProductStore } from '@/core/sceneProducts/store'
import type {
  BPlaneScenePayload,
  BPlaneSceneProduct,
  EncounterDensityScenePayload,
  EncounterDensitySceneProduct,
  SceneProducts,
  SceneProductQuality,
  TrajectorySceneProduct,
  UncertaintyTubeScenePayload,
  UncertaintyTubeSceneProduct,
} from '@/core/sceneProducts/types'
import { useFrameStore } from '@/store/frameStore'
import { useSimStore } from '@/store/simStore'
import { arcPositions, scanClosestApproach } from '@/services/nbody'
import { useEventSceneStore, type EventSceneTask } from './eventSceneStore'
import type { EventAnalysisContext } from './types'

const EARTH_ORBIT_DAYS = 365.2568983
const MAX_NBODY_SPAN_DAYS = 3652.5

export interface EventSceneCommandContext {
  contextId: string
  eventKey: string
  designation: string
  encounterJd: number
  requestedOrbitSolutionId: string | null
  semiMajorAxis: number | null
  simulated: boolean
}

function quality(match: boolean, simulated: boolean): SceneProductQuality {
  if (simulated) return 'simulated'
  return match ? 'exact' : 'degraded'
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function bPlanePayload(result: NominalBPlane): BPlaneScenePayload {
  const { meta: _meta, ...payload } = result
  return payload
}

function uncertaintyTubePayload(result: LocalBPlaneUncertainty): UncertaintyTubeScenePayload {
  return {
    designation: result.designation,
    confidenceSigma: result.uncertaintyTube.confidenceSigma,
    sections: result.uncertaintyTube.sections,
    nominalTrajectory: result.nominalTrajectory,
    assessmentId: result.assessmentId,
    orbitSolutionId: result.orbitSolutionId,
    orbitSolutionMatch: result.orbitSolutionMatch,
  }
}

function encounterDensityPayload(result: LocalBPlaneUncertainty): EncounterDensityScenePayload {
  return {
    designation: result.designation,
    method: result.method,
    sampleCount: result.sampleCount,
    hitCount: result.hitCount,
    localImpactProbability: result.localImpactProbability,
    bPlaneCovarianceKm2: result.bPlaneCovarianceKm2,
    nominalBPlane: bPlanePayload(result.nominalBPlane),
    assessmentId: result.assessmentId,
    covarianceEpochTdb: result.covarianceEpochTdb,
    requestedOrbitSolutionId: result.requestedOrbitSolutionId,
    orbitSolutionId: result.orbitSolutionId,
    orbitSolutionMatch: result.orbitSolutionMatch,
    ignoredLabels: result.ignoredLabels,
  }
}

/**
 * 事件专题唯一的计算与场景发布入口。UI 只发命令，Renderer 只读产品。
 */
class EventSceneController {
  private readonly requests = new Map<EventSceneTask, symbol>()

  activate(contextId: string): void {
    useEventSceneStore.getState().activate(contextId)
    useSceneProductStore.getState().activate(contextId)
  }

  clear(contextId?: string): void {
    this.requests.clear()
    useEventSceneStore.getState().clear(contextId)
    useSceneProductStore.getState().clear(contextId)
  }

  /** 自动加载入口：已有产品或同一上下文正在计算时不重复提交任务。 */
  ensureOrbitPropagation(context: EventSceneCommandContext): Promise<void> {
    const scene = useSceneProductStore.getState()
    const tasks = useEventSceneStore.getState()
    if (scene.contextId === context.contextId && scene.products.trajectory) {
      return Promise.resolve()
    }
    if (tasks.contextId === context.contextId && tasks.tasks.propagation.state === 'loading') {
      return Promise.resolve()
    }
    return this.propagateOrbit(context)
  }

  async propagateOrbit(context: EventSceneCommandContext): Promise<void> {
    const token = this.begin(context, 'propagation', ['trajectory'])
    const a = context.semiMajorAxis
    if (!a || !Number.isFinite(a) || a <= 0) {
      this.fail(context, 'propagation', token, '缺少有效半长轴，无法确定完整公转周期')
      return
    }
    const periodDays = EARTH_ORBIT_DAYS * a ** 1.5
    if (periodDays > MAX_NBODY_SPAN_DAYS) {
      this.fail(context, 'propagation', token, `名义公转周期约 ${(periodDays / EARTH_ORBIT_DAYS).toFixed(1)} 年，超过单次推演 10 年上限`)
      return
    }

    try {
      const t0 = context.encounterJd - periodDays / 2
      const t1 = context.encounterJd + periodDays / 2
      const [arc, encounterArc] = await Promise.all([
        propagateArc(context.designation, t0, t1, periodDays / 1500, context.requestedOrbitSolutionId),
        propagateArc(context.designation, context.encounterJd - 3, context.encounterJd + 3, 0.01, context.requestedOrbitSolutionId),
      ])
      if (!this.isCurrent(context, 'propagation', token)) return
      if (!arc) {
        this.fail(context, 'propagation', token, '库中无此天体轨道数据，无法执行 N 体推演')
        return
      }
      const closest = scanClosestApproach(encounterArc?.points ?? arc.points)
      const product: TrajectorySceneProduct = {
        productId: `${context.contextId}:trajectory:${arc.orbitSolutionId ?? 'unknown'}`,
        contextId: context.contextId,
        kind: 'trajectory',
        sourceSystem: arc.meta.sourceSystem,
        dataVersion: arc.orbitSolutionId,
        algorithmVersion: arc.meta.algorithmVersion,
        inputProductIds: [],
        referenceFrame: arc.meta.referenceFrame,
        timeScale: arc.meta.timeScale,
        temporalMode: 'sampled',
        anchorJd: closest?.jd ?? context.encounterJd,
        quality: quality(arc.orbitSolutionMatch, context.simulated),
        payload: {
          eventKey: context.eventKey,
          positions: arcPositions(arc.points),
          source: arc.source,
          closestKm: closest?.distKm ?? null,
          closestJd: closest?.jd ?? null,
          spanDays: periodDays,
          orbitSolutionId: arc.orbitSolutionId,
          orbitSolutionMatch: arc.orbitSolutionMatch,
        },
      }
      useSceneProductStore.getState().publish(context.contextId, 'trajectory', product)
      this.finish(context, 'propagation', token)
    } catch (error) {
      this.fail(context, 'propagation', token, errorMessage(error, 'N 体推演失败'))
    }
  }

  async calculateBPlane(context: EventSceneCommandContext): Promise<void> {
    this.cancel(context, 'uncertainty')
    const token = this.begin(context, 'bPlane', ['bPlane', 'uncertaintyTube', 'encounterDensity'])
    try {
      const result = await fetchNominalBPlane(
        context.designation, context.encounterJd, context.requestedOrbitSolutionId,
      )
      if (!this.isCurrent(context, 'bPlane', token)) return
      this.publishBPlane(context, result)
      this.finish(context, 'bPlane', token)
      this.focusBPlane(context, result)
    } catch (error) {
      this.fail(context, 'bPlane', token, errorMessage(error, 'B 平面计算失败'))
    }
  }

  async calculateUncertainty(
    context: EventSceneCommandContext,
    focusAfterCalculation = true,
  ): Promise<void> {
    this.cancel(context, 'bPlane')
    const token = this.begin(context, 'uncertainty', ['bPlane', 'uncertaintyTube', 'encounterDensity'])
    try {
      const result = await fetchLocalBPlaneUncertainty(
        context.designation, context.encounterJd, 4096, context.requestedOrbitSolutionId,
      )
      if (!this.isCurrent(context, 'uncertainty', token)) return
      this.publishBPlane(context, result.nominalBPlane)
      const tubeProduct: UncertaintyTubeSceneProduct = {
        productId: `${context.contextId}:uncertainty-tube:${result.assessmentId}`,
        contextId: context.contextId,
        kind: 'uncertainty-tube',
        sourceSystem: result.meta.sourceSystem,
        dataVersion: result.orbitSolutionId,
        algorithmVersion: result.meta.algorithmVersion,
        inputProductIds: result.meta.inputProductIds ?? [result.assessmentId],
        referenceFrame: result.meta.referenceFrame,
        timeScale: result.meta.timeScale,
        temporalMode: 'sampled',
        anchorJd: result.nominalBPlane.closestJd,
        quality: quality(result.orbitSolutionMatch, context.simulated),
        payload: uncertaintyTubePayload(result),
      }
      const densityProduct: EncounterDensitySceneProduct = {
        productId: `${context.contextId}:encounter-density:${result.assessmentId}`,
        contextId: context.contextId,
        kind: 'encounter-density',
        sourceSystem: result.meta.sourceSystem,
        dataVersion: result.orbitSolutionId,
        algorithmVersion: result.meta.algorithmVersion,
        inputProductIds: result.meta.inputProductIds ?? [result.assessmentId],
        referenceFrame: result.meta.referenceFrame,
        timeScale: result.meta.timeScale,
        temporalMode: 'anchored',
        anchorJd: result.nominalBPlane.closestJd,
        quality: quality(result.orbitSolutionMatch, context.simulated),
        payload: encounterDensityPayload(result),
      }
      const sceneProducts = useSceneProductStore.getState()
      sceneProducts.publish(context.contextId, 'uncertaintyTube', tubeProduct)
      sceneProducts.publish(context.contextId, 'encounterDensity', densityProduct)
      this.finish(context, 'uncertainty', token)
      if (focusAfterCalculation) this.focusBPlane(context, result.nominalBPlane)
    } catch (error) {
      this.fail(context, 'uncertainty', token, errorMessage(error, '局部 B 平面协方差评估失败'))
    }
  }

  private publishBPlane(context: EventSceneCommandContext, result: NominalBPlane): void {
    const product: BPlaneSceneProduct = {
      productId: `${context.contextId}:b-plane:${result.orbitSolutionId ?? 'unknown'}:${result.closestJd}`,
      contextId: context.contextId,
      kind: 'b-plane',
      sourceSystem: result.meta.sourceSystem,
      dataVersion: result.orbitSolutionId,
      algorithmVersion: result.meta.algorithmVersion,
      inputProductIds: result.meta.inputProductIds ?? [],
      referenceFrame: result.meta.referenceFrame,
      timeScale: result.meta.timeScale,
      temporalMode: 'anchored',
      anchorJd: result.closestJd,
      quality: quality(result.orbitSolutionMatch, context.simulated),
      payload: bPlanePayload(result),
    }
    useSceneProductStore.getState().publish(context.contextId, 'bPlane', product)
  }

  private focusBPlane(context: EventSceneCommandContext, result: NominalBPlane): void {
    useFrameStore.getState().setFrame('geo')
    useSimStore.getState().setJD(result.closestJd)
    useSimStore.getState().setPlaying(false)
    useSceneProductStore.getState().requestBPlaneFocus(context.contextId)
  }

  private begin(
    context: EventSceneCommandContext,
    task: EventSceneTask,
    clear: (keyof SceneProducts)[],
  ): symbol {
    this.activate(context.contextId)
    const token = Symbol(task)
    this.requests.set(task, token)
    useSceneProductStore.getState().clearProducts(context.contextId, clear)
    useEventSceneStore.getState().startTask(context.contextId, task)
    return token
  }

  private cancel(context: EventSceneCommandContext, task: EventSceneTask): void {
    this.requests.delete(task)
    useEventSceneStore.getState().finishTask(context.contextId, task)
  }

  private isCurrent(context: EventSceneCommandContext, task: EventSceneTask, token: symbol): boolean {
    return this.requests.get(task) === token
      && useSceneProductStore.getState().contextId === context.contextId
  }

  private finish(context: EventSceneCommandContext, task: EventSceneTask, token: symbol): void {
    if (!this.isCurrent(context, task, token)) return
    this.requests.delete(task)
    useEventSceneStore.getState().finishTask(context.contextId, task)
  }

  private fail(
    context: EventSceneCommandContext,
    task: EventSceneTask,
    token: symbol,
    message: string,
  ): void {
    if (!this.isCurrent(context, task, token)) return
    this.requests.delete(task)
    useEventSceneStore.getState().failTask(context.contextId, task, message)
  }
}

export const eventSceneController = new EventSceneController()

export function eventSceneCommandContext(
  contextId: string,
  eventKey: string,
  designation: string,
  encounterJd: number,
  requestedOrbitSolutionId: string | null,
  semiMajorAxis: number | null,
  simulated: boolean,
): EventSceneCommandContext {
  return {
    contextId,
    eventKey,
    designation,
    encounterJd,
    requestedOrbitSolutionId,
    semiMajorAxis,
    simulated,
  }
}

export function eventSceneCommandContextFromAnalysis(
  analysis: EventAnalysisContext,
): EventSceneCommandContext {
  const event = analysis.event
  return eventSceneCommandContext(
    analysis.contextId,
    event.key,
    analysis.designation ?? event.record?.el.des ?? event.target,
    event.jdEnc,
    analysis.requestedOrbitSolutionId,
    analysis.orbit?.payload.a ?? event.record?.el.a ?? null,
    event.source === 'sim',
  )
}
