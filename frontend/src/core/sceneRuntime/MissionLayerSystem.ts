import type { Vector3 } from 'three'
import type { ObservationPlayback } from '@/features/l1/missionProvider'
import type { L1Reference, ObserverState } from '@/features/l1/types'
import type { AsteroidCloud } from '../AsteroidCloud'
import type { GroundSurveySystem } from '../GroundSurveySystem'
import type { SatelliteModel } from '../SatelliteModel'
import type { SurveySystem } from '../SurveySystem'

export interface L1MissionFrame {
  observer: ObserverState | null
  reference: L1Reference | null
  playback: ObservationPlayback | null
}

export interface L1MissionLayers {
  sphereRadius: number
  showSphere: boolean
  showGraticuleLabels: boolean
  showOccultation: boolean
  showSunAvoidance: boolean
  showAntiSunLimit: boolean
  showEarthAvoidance: boolean
  showPlannedFootprints: boolean
  showExposedFootprints: boolean
}

export interface GroundMissionLayers {
  sphereRadius: number
  showOccultation: boolean
  showSunAvoidance: boolean
  showMoonAvoidance: boolean
  showZodiacBand: boolean
  showGraticuleLabels: boolean
}

interface MissionLayerSystemOptions {
  surveySystem: SurveySystem
  groundSurveySystem: GroundSurveySystem
  satelliteModel: SatelliteModel
  asteroidCloud: AsteroidCloud
  onGeometricSampleCount: (count: number) => void
}

interface L1MissionUpdate {
  active: boolean
  jd: number
  mission: L1MissionFrame
  layers: L1MissionLayers
  sunScenePosition: Vector3
  earthScenePosition: Vector3
  satelliteScenePosition: Vector3
}

interface GroundMissionUpdate {
  active: boolean
  layers: GroundMissionLayers
  sunScenePosition: Vector3
  earthScenePosition: Vector3
  moonScenePosition: Vector3
}

/**
 * 任务图层的 Three.js 协调器。
 *
 * 上游负责提供任务快照与显示配置；本类只把它们应用到场景对象，既不生成
 * 扫描策略，也不读取页面状态。未来替换计划/轨道数据源时无需修改这里。
 */
export class MissionLayerSystem {
  private readonly surveySystem: SurveySystem
  private readonly groundSurveySystem: GroundSurveySystem
  private readonly satelliteModel: SatelliteModel
  private readonly asteroidCloud: AsteroidCloud
  private readonly onGeometricSampleCount: (count: number) => void
  private geometricSampleCount = 0

  constructor(options: MissionLayerSystemOptions) {
    this.surveySystem = options.surveySystem
    this.groundSurveySystem = options.groundSurveySystem
    this.satelliteModel = options.satelliteModel
    this.asteroidCloud = options.asteroidCloud
    this.onGeometricSampleCount = options.onGeometricSampleCount
  }

  updateL1(update: L1MissionUpdate): void {
    const { observer, reference, playback } = update.mission
    if (!update.active || !observer || !reference) {
      this.surveySystem.setVisible(false)
      this.resetGeometricSamples()
      return
    }

    const showingPlan = !!playback?.activity && !!playback.quaternion
    const exposing = showingPlan
      && playback.activity?.kind === 'exposure'
      && playback.check?.valid
    const { layers } = update

    this.surveySystem.configure(reference.profile, playback?.prepared.plan.instrument)
    this.surveySystem.setVisible(true)
    this.surveySystem.setSphereR(layers.sphereRadius)
    this.surveySystem.setSphereVisible(layers.showSphere)
    this.surveySystem.setGratLabels(layers.showGraticuleLabels)
    this.surveySystem.setOccult(layers.showOccultation)
    this.surveySystem.setSunAvoid(layers.showSunAvoidance)
    this.surveySystem.setAntiSunLimit(layers.showAntiSunLimit)
    this.surveySystem.setEarthAvoid(layers.showEarthAvoidance)
    this.surveySystem.setConeActive(!!exposing)
    this.surveySystem.setConeVisible(showingPlan)
    this.surveySystem.setFootprints(
      playback?.prepared ?? null,
      update.jd,
      layers.showPlannedFootprints,
      layers.showExposedFootprints,
    )
    this.surveySystem.update(
      update.sunScenePosition,
      update.earthScenePosition,
      update.satelliteScenePosition,
      playback?.quaternion ?? null,
    )

    if (playback?.quaternion) {
      this.satelliteModel.setPointing(
        this.surveySystem.coneAxis,
        this.surveySystem.coneRight,
        this.surveySystem.coneUp,
      )
    }

    const count = this.surveySystem.highlightGeometricSamples(
      this.asteroidCloud.getPositions(),
      this.asteroidCloud.getColors(),
      this.asteroidCloud.baseCol,
      this.asteroidCloud.getCount(),
    )
    this.asteroidCloud.markColorsDirty()
    this.publishGeometricSampleCount(count)
  }

  updateGround(update: GroundMissionUpdate): void {
    if (!update.active) return
    const { layers } = update
    this.groundSurveySystem.setOccult(layers.showOccultation)
    this.groundSurveySystem.setSunAvoid(layers.showSunAvoidance)
    this.groundSurveySystem.setMoonAvoid(layers.showMoonAvoidance)
    this.groundSurveySystem.setZodiacBand(layers.showZodiacBand)
    this.groundSurveySystem.setGratLabels(layers.showGraticuleLabels)
    this.groundSurveySystem.setSphereR(layers.sphereRadius)
    this.groundSurveySystem.update(
      update.sunScenePosition,
      update.earthScenePosition,
      update.moonScenePosition,
    )
  }

  private resetGeometricSamples(): void {
    if (this.geometricSampleCount === 0) return
    this.asteroidCloud.getColors().set(this.asteroidCloud.baseCol)
    this.asteroidCloud.markColorsDirty()
    this.publishGeometricSampleCount(0)
  }

  private publishGeometricSampleCount(count: number): void {
    if (count === this.geometricSampleCount) return
    this.geometricSampleCount = count
    this.onGeometricSampleCount(count)
  }
}
