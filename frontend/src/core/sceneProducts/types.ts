export type SceneProductQuality = 'exact' | 'degraded' | 'simulated'
export type SceneProductTemporalMode = 'static' | 'sampled' | 'anchored'

export interface SceneProduct<T> {
  productId: string
  contextId: string
  kind: 'trajectory' | 'b-plane' | 'uncertainty-tube' | 'encounter-density'
  sourceSystem: string
  dataVersion: string | null
  algorithmVersion: string
  inputProductIds: string[]
  referenceFrame: 'ECLIPJ2000' | 'GEO_ECLIPTIC'
  timeScale: 'TDB'
  /** sampled 随仿真时间取样；anchored 固定于 anchorJd；static 与时间无关。 */
  temporalMode: SceneProductTemporalMode
  anchorJd: number | null
  quality: SceneProductQuality
  payload: T
}

export interface TrajectoryScenePayload {
  eventKey: string
  positions: Float32Array
  source: 'ephemeris' | 'elements'
  closestKm: number | null
  closestJd: number | null
  spanDays: number
  orbitSolutionId: string | null
  orbitSolutionMatch: boolean
}

export interface BPlaneScenePayload {
  designation: string
  requestedEncounterJd: number
  closestJd: number
  closestDistanceKm: number
  xiKm: number
  zetaKm: number
  bMagnitudeKm: number
  vinfKms: number
  effectiveImpactRadiusKm: number
  bVectorEclipticKm: [number, number, number]
  incomingDirectionEcliptic: [number, number, number]
  xiAxisEcliptic: [number, number, number]
  zetaAxisEcliptic: [number, number, number]
  source: 'nominal-nbody' | 'local-covariance-nbody'
  propagationSource: 'ephemeris' | 'elements' | 'covariance-elements'
  orbitSolutionId: string | null
  requestedOrbitSolutionId: string | null
  orbitSolutionMatch: boolean
}

export interface UncertaintyTubeSectionScenePayload {
  jd: number
  centerEclipticAu: [number, number, number]
  axisAEcliptic: [number, number, number]
  axisBEcliptic: [number, number, number]
  radiusAAu: number
  radiusBAu: number
}

export interface UncertaintyTubeScenePayload {
  designation: string
  confidenceSigma: number
  sections: UncertaintyTubeSectionScenePayload[]
  nominalTrajectory: NominalTrajectoryScenePayload
  assessmentId: string
  orbitSolutionId: string | null
  orbitSolutionMatch: boolean
}

export interface NominalTrajectoryScenePayload {
  points: {
    jd: number
    centerEclipticAu: [number, number, number]
  }[]
}

export interface EncounterDensityScenePayload {
  designation: string
  method: 'local-linear-nbody-sobol'
  sampleCount: number
  hitCount: number
  localImpactProbability: number
  bPlaneCovarianceKm2: [[number, number], [number, number]]
  nominalBPlane: BPlaneScenePayload
  assessmentId: string
  covarianceEpochTdb: number
  requestedOrbitSolutionId: string | null
  orbitSolutionId: string | null
  orbitSolutionMatch: boolean
  ignoredLabels: string[]
}

export type TrajectorySceneProduct = SceneProduct<TrajectoryScenePayload>
export type BPlaneSceneProduct = SceneProduct<BPlaneScenePayload>
export type UncertaintyTubeSceneProduct = SceneProduct<UncertaintyTubeScenePayload>
export type EncounterDensitySceneProduct = SceneProduct<EncounterDensityScenePayload>

export interface SceneProducts {
  trajectory: TrajectorySceneProduct | null
  bPlane: BPlaneSceneProduct | null
  uncertaintyTube: UncertaintyTubeSceneProduct | null
  encounterDensity: EncounterDensitySceneProduct | null
}

export const emptySceneProducts = (): SceneProducts => ({
  trajectory: null,
  bPlane: null,
  uncertaintyTube: null,
  encounterDensity: null,
})
