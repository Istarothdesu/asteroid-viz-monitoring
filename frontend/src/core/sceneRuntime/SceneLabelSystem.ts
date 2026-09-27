import * as THREE from 'three'
import { PLANETS } from '@/data/planets'
import { isGroundMissionMode, isL1MissionMode, selectedStationIndex } from '@/services/viewPolicy'
import { useDataStore } from '@/store/dataStore'
import { useFrameStore } from '@/store/frameStore'
import { useLayerStore } from '@/store/layerStore'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useUIStore } from '@/store/uiStore'
import type { AsteroidCloud } from '@/core/AsteroidCloud'
import type { EarthSystem } from '@/core/EarthSystem'
import type { GroundSurveySystem } from '@/core/GroundSurveySystem'
import type { PlanetSystem } from '@/core/PlanetSystem'
import type { RiskRenderer } from '@/core/RiskRenderer'
import type { SatelliteModel } from '@/core/SatelliteModel'
import type { SurveySystem } from '@/core/SurveySystem'
import { isObjectTreeVisible } from './objectUtils'
import type { NamedAsteroidSystem } from './NamedAsteroidSystem'

export interface SceneLabelPosition {
  key: string
  label: string
  x: number
  y: number
  visible: boolean
}

interface Sources {
  camera: THREE.PerspectiveCamera
  planetSystem: PlanetSystem
  satelliteModel: SatelliteModel
  surveySystem: SurveySystem
  groundSurveySystem: GroundSurveySystem
  earthSystem: EarthSystem
  riskRenderer: RiskRenderer
  namedAsteroids: NamedAsteroidSystem
  asteroidCloud: AsteroidCloud
  cloudSelectionProxy: THREE.Object3D
  eventMesh: THREE.Mesh
}

/** 将三维对象映射为 DOM 标签，统一处理业务模式过滤和记录复用。 */
export class SceneLabelSystem {
  private readonly sources: Sources
  private readonly pool: SceneLabelPosition[] = []
  private readonly output: SceneLabelPosition[] = []
  private readonly projected = new THREE.Vector3()

  constructor(sources: Sources) {
    this.sources = sources
  }

  getPositions(canvasWidth: number, canvasHeight: number): SceneLabelPosition[] {
    const result = this.output
    result.length = 0
    const {
      camera,
      planetSystem,
      satelliteModel,
      surveySystem,
      groundSurveySystem,
      earthSystem,
      riskRenderer,
      namedAsteroids,
      asteroidCloud,
      cloudSelectionProxy,
      eventMesh,
    } = this.sources
    const frameState = useFrameStore.getState()
    const mode = useUIStore.getState().mode
    const layers = useLayerStore.getState()
    const selected = useSelectionStore.getState().selected
    const stationIndex = selectedStationIndex(mode, selected)
    const stationFocus = stationIndex !== null
    const project = (object: THREE.Object3D, key: string, label: string) => {
      if (!isObjectTreeVisible(object)) return
      object.getWorldPosition(this.projected)
      this.projected.project(camera)
      let record = this.pool[result.length]
      if (!record) {
        record = { key: '', label: '', x: 0, y: 0, visible: false }
        this.pool.push(record)
      }
      record.key = key
      record.label = label
      record.x = (this.projected.x * 0.5 + 0.5) * canvasWidth
      record.y = (-this.projected.y * 0.5 + 0.5) * canvasHeight
      record.visible = this.projected.z <= 1
      result.push(record)
    }

    if (!stationFocus) {
      project(planetSystem.sunMesh, 'sun', '太阳')
      PLANETS.forEach((planet, index) =>
        project(planetSystem.planetMeshes[index], `planet-${index}`, planet.name))
      project(planetSystem.moonMesh, 'moon', '月球')
      if (satelliteModel.satGroup.visible) {
        project(satelliteModel.satGroup, 'sat', 'L1仿真卫星')
      }
    }

    if (isL1MissionMode(mode) && surveySystem.group.visible) {
      const instrument = surveySystem.getInstrument()
      if (layers.showOccult) {
        project(surveySystem.sunCapMark, 'sun-occ', '太阳遮挡区')
        project(surveySystem.earthCapMark, 'earth-occ', '地球遮挡区')
      }
      if (layers.showSunAvoid) {
        project(surveySystem.sunAvoidMark, 'sun-avoid', `太阳规避区 ${instrument?.sunAvoidanceDeg}°`)
      }
      if (layers.showAntiSunLimit) {
        project(surveySystem.antiSunLimitMark, 'anti-sun-limit', `太阳伸长角上限 >${instrument?.maxSunElongationDeg}°（NEO Surveyor 参考）`)
      }
      if (layers.showEarthAvoid) {
        project(surveySystem.earthAvoidMark, 'earth-avoid', `地球规避区（视半径＋${instrument?.earthAvoidanceMarginDeg}°·仿真）`)
      }
      if (layers.showL1Sphere && layers.showL1GratLabels) {
        surveySystem.gratMarks.raMarks.forEach((mark, index) =>
          project(mark, `l1-grat-ra-${index}`, `${index * 2}h`))
        const declinations = ['+60°', '+30°', '-30°', '-60°']
        surveySystem.gratMarks.decMarks.forEach((mark, index) =>
          project(mark, `l1-grat-dec-${index}`, declinations[index]))
      }
    }

    if (isGroundMissionMode(mode) && earthSystem.groundRoot.visible) {
      if (layers.showGroundOccult) {
        project(groundSurveySystem.sunCapMark, 'g-sun-occ', '太阳遮挡区')
        project(groundSurveySystem.moonCapMark, 'g-moon-occ', '月球遮挡区')
      }
      if (layers.showGSunAvoid) {
        project(groundSurveySystem.sunAvoidMark, 'g-sun-avoid', '太阳规避区 45°')
      }
      if (layers.showMoonAvoid) {
        project(groundSurveySystem.moonAvoidMark, 'g-moon-avoid', '月球规避区 45°')
      }
      earthSystem.stationObjects.forEach((station, index) => {
        if (station.grp.visible && (!stationFocus || stationIndex === index)) {
          project(station.grp, `station-${index}`, station.st.name)
        }
      })
      if (layers.showGratLabels) {
        groundSurveySystem.gratMarks.raMarks.forEach((mark, index) =>
          project(mark, `grat-ra-${index}`, `${index * 2}h`))
        const declinations = ['+60°', '+30°', '-30°', '-60°']
        groundSurveySystem.gratMarks.decMarks.forEach((mark, index) =>
          project(mark, `grat-dec-${index}`, declinations[index]))
      }
    }

    const replay = useEventSimulationStore.getState()
    if (!stationFocus) {
      if (frameState.frame === 'comp') {
        if (replay.activeEvent && eventMesh.visible) {
          project(eventMesh, 'comp-center', `${replay.activeEvent.name.split(' ')[0]} (骑乘仿真)`)
        } else {
          const mesh = namedAsteroids.getMesh(frameState.compIdx)
          const asteroid = useDataStore.getState().asteroids[frameState.compIdx]
          if (mesh) project(mesh, 'comp-center', `${asteroid.name} (伴飞)`)
        }
      } else if (replay.activeEvent && eventMesh.visible) {
        project(eventMesh, 'event', replay.activeEvent.name.split(' ')[0])
      } else if (replay.previewRec && eventMesh.visible) {
        project(eventMesh, 'event', replay.previewRec.name.split(' ')[0])
      }
    }

    if (!stationFocus && selected?.kind === 'ast') {
      const duplicate = frameState.frame === 'comp' && selected.idx === frameState.compIdx
      const mesh = namedAsteroids.getMesh(selected.idx)
      const asteroid = useDataStore.getState().asteroids[selected.idx]
      if (!duplicate && mesh) project(mesh, 'sel-ast', asteroid.name)
    } else if (!stationFocus && selected?.kind === 'cloud' && cloudSelectionProxy.visible) {
      const seed = asteroidCloud.getSeed(selected.idx)
      project(
        cloudSelectionProxy,
        'sel-cloud',
        seed?.des ?? `云粒子 #${selected.idx + 1}`,
      )
    }

    if (!stationFocus) {
      riskRenderer.labelPoints().forEach(({ key, label, object }) =>
        project(object, key, label))
    }
    return result
  }
}
