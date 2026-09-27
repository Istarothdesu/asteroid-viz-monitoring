export interface MissionProfile {
  id: string; version: number; kind: 'simulation'; name: string
  timeScale: 'TDB'; frame: 'ECLIPJ2000'; positionUnit: 'AU'; velocityUnit: 'AU/day'
  epochJdTdb: number
  instrument: { fovWidthDeg: number; fovHeightDeg: number; sunAvoidanceDeg: number;
    maxSunElongationDeg: number; earthAvoidanceMarginDeg: number }
  survey: { minSolarLongitudeDeg: number; maxSolarLongitudeDeg: number; maxLatitudeDeg: number }
  demo: { slewRateDegPerSec: number; slewAccelerationDegPerSec2: number; settleSeconds: number;
    exposureSeconds: number; readoutSeconds: number; exposuresPerVisit: number; visitsPerField: number;
    revisitHours: number; gridColumns: number; gridRows: number; overlapFraction: number }
  surveyReference: string
  calibration: { cycleDays: number; durationHours: number }
  assumptions: string[]
}

export interface L1Reference {
  profile: MissionProfile
  orbit: {
    model: string; source: string; sourceVersion: string; massRatio: number
    lengthUnitAu: number; timeUnitSeconds: number; l1SynodicX: number
    phaseEpochJdTdb: number; periodNormalized: number; periodDays: number
    samples: number[][]
    validation: { closureAu: number; jacobiDrift: number }
  }
}

export interface TimeAxis {
  startJdTdb: number; endJdTdb: number; samples: [number, number][]
  leaps: { startJdTdb: number; endJdTdb: number; label: string }[]
  source: string; assumption: string
}

export interface Vector { x: number; y: number; z: number }
export interface ObserverState {
  jdTdb: number; positionAu: Vector; velocityAuPerDay: Vector; earthPositionAu: Vector
  l1PointAu: Vector; earthDistanceAu: number
  basis: [Vector, Vector, Vector]
  source: 'CR3BP-following-map'; earthSource: 'ephemeris'; profileId: string
}
