import { useCallback, useEffect, useMemo } from 'react'
import type { RiskAssessmentResult } from '@/api/client'
import { useSceneProductStore } from '@/core/sceneProducts/store'
import { eventSceneCommandContext, eventSceneController } from './EventSceneController'
import { useEventSceneStore } from './eventSceneStore'
import type { EventAnalysisContext } from './types'

export function useRiskAnalysis(
  analysis: EventAnalysisContext,
  designation: string,
  encounterJd: number,
  requestedOrbitSolutionId?: string | null,
) {
  const commandContext = useMemo(() => eventSceneCommandContext(
    analysis.contextId,
    analysis.event.key,
    designation,
    encounterJd,
    requestedOrbitSolutionId ?? null,
    analysis.orbit?.payload.a ?? analysis.event.record?.el.a ?? null,
    analysis.event.source === 'sim',
  ), [analysis.contextId, analysis.event.key, analysis.event.record?.el.a, analysis.event.source,
    analysis.orbit?.payload.a, designation, encounterJd, requestedOrbitSolutionId])

  const bPlane = useSceneProductStore(state => state.products.bPlane?.payload ?? null)
  const uncertaintyTube = useSceneProductStore(state => state.products.uncertaintyTube?.payload ?? null)
  const encounterDensity = useSceneProductStore(state => state.products.encounterDensity?.payload ?? null)
  const bPlaneTask = useEventSceneStore(state => state.tasks.bPlane)
  const uncertaintyTask = useEventSceneStore(state => state.tasks.uncertainty)

  const risk = useMemo<RiskAssessmentResult>(() => ({
    designation,
    assessment: analysis.covariance?.payload ?? null,
    sentry: analysis.sentry?.payload ?? null,
    requestedOrbitSolutionId: analysis.requestedOrbitSolutionId,
    orbitSolutionMatch: !analysis.requestedOrbitSolutionId || (
      analysis.resolution.orbit === 'exact' && analysis.resolution.covariance === 'exact'
    ),
    availability: {
      uncertainty: analysis.capabilities.uncertainty,
      bPlane: analysis.capabilities.bPlane,
      impactCorridor: false,
    },
  }), [analysis, designation])

  const calculateBPlane = useCallback(
    () => eventSceneController.calculateBPlane(commandContext),
    [commandContext],
  )
  const calculateUncertainty = useCallback(
    () => eventSceneController.calculateUncertainty(commandContext),
    [commandContext],
  )

  useEffect(() => {
    eventSceneController.activate(analysis.contextId)
    if (risk.availability.uncertainty) {
      void eventSceneController.calculateUncertainty(commandContext, false)
    }
  }, [analysis.contextId, commandContext, risk.availability.uncertainty])

  return {
    risk,
    bPlane,
    bPlaneState: bPlaneTask.state,
    bPlaneError: bPlaneTask.message,
    uncertaintyTube,
    encounterDensity,
    estimateState: uncertaintyTask.state,
    estimateError: uncertaintyTask.message,
    calculateBPlane,
    calculateUncertainty,
  }
}
