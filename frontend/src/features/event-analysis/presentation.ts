import type { EventRecord } from '@/types/scene'
import { cadToRecord } from '@/services/eventCenter'
import type { EventAnalysisContext, OrbitSnapshot } from './types'

export type OrbitElementsView = Pick<OrbitSnapshot, 'a' | 'e' | 'i' | 'O' | 'w'>

/** 领域上下文到现有场景预览模型的唯一适配点。 */
export function eventPreviewRecord(context: EventAnalysisContext): EventRecord | null {
  if (context.event.record) return context.event.record
  if (!context.event.cad || !context.orbit) return null
  return cadToRecord(context.event.cad, context.orbit.payload)
}

export function orbitElementsView(context: EventAnalysisContext): OrbitElementsView | null {
  const orbit = context.orbit?.payload
  return orbit ? { a: orbit.a, e: orbit.e, i: orbit.i, O: orbit.O, w: orbit.w } : null
}

