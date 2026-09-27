import type { EventDetail, RiskAssessmentSnapshot, SentryRiskSummary } from '@/api/client'

export type ResolutionMode = 'exact' | 'current' | 'latest-recompute' | 'unavailable'

export interface ProductMeta {
  sourceSystem: string
  authority: 'official' | 'official-cache' | 'local' | 'simulated' | string
  dataVersion: string
  generatedAt: string
  timeScale: 'UTC' | 'TDB' | 'TT' | null
  referenceFrame: string | null
  quality: {
    status: 'valid' | 'degraded' | 'unavailable'
    message: string | null
  }
}

export interface DataProduct<T> {
  productId: string
  meta: ProductMeta
  payload: T
}

export interface OrbitSnapshot {
  designation: string
  orbitSolutionId: string | null
  a: number
  e: number
  i: number
  O: number
  w: number
  M0: number
  epochJd: number
}

export interface EventAnalysisContext {
  contextId: string
  event: EventDetail
  designation: string | null
  requestedOrbitSolutionId: string | null
  orbit: DataProduct<OrbitSnapshot> | null
  covariance: DataProduct<RiskAssessmentSnapshot> | null
  sentry: DataProduct<SentryRiskSummary> | null
  resolution: {
    orbit: ResolutionMode
    covariance: ResolutionMode
  }
  capabilities: {
    orbitPreview: boolean
    nBody: boolean
    bPlane: boolean
    uncertainty: boolean
  }
}

