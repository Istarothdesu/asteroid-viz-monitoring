import { useEffect, useRef } from 'react'
import { eventSceneCommandContextFromAnalysis, eventSceneController } from '@/features/event-analysis/EventSceneController'
import type { EventAnalysisContext } from '@/features/event-analysis/types'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useSimStore } from '@/store/simStore'
import type { EventRecord } from '@/types/scene'
import { eventWindow, type EventDetail } from '@/services/eventCenter'
import { defaultSimulationRange } from '@/utils/orbital/time'

interface EventDetailSceneLifecycleOptions {
  analysis: EventAnalysisContext | null
  event: EventDetail | null
  previewRecord: EventRecord | null
  replaying: boolean
}

/** 管理事件专题进入、传播、选中恢复和离场清理，布局组件不再直接编排场景副作用。 */
export function useEventDetailSceneLifecycle({
  analysis,
  event,
  previewRecord,
  replaying,
}: EventDetailSceneLifecycleOptions) {
  const leaving = useRef(false)
  const latestAnalysis = useRef(analysis)
  const latestPreviewRecord = useRef(previewRecord)
  latestAnalysis.current = analysis
  latestPreviewRecord.current = previewRecord

  const contextId = analysis?.contextId ?? null
  const eventKey = event?.key ?? ''
  const windowStart = event ? eventWindow(event).start : null
  const windowEnd = event ? eventWindow(event).end : null

  useEffect(() => {
    if (windowStart == null || windowEnd == null || replaying) return
    const simulation = useSimStore.getState()
    simulation.setSimulationRange(windowStart, windowEnd)
    if (simulation.jd < windowStart || simulation.jd > windowEnd) simulation.setJD(windowStart)
    return () => {
      if (!useEventSimulationStore.getState().activeEvent) {
        useSimStore.getState().setSimulationRange(...defaultSimulationRange())
      }
    }
  }, [eventKey, replaying, windowEnd, windowStart])

  /* 分析基准时刻刷新会生成新的 context 对象，但 contextId 不变。
     场景产品的生命周期必须绑定业务上下文，不能绑定 React 对象引用。 */
  useEffect(() => {
    if (!contextId) return
    let cancelled = false
    leaving.current = false
    eventSceneController.activate(contextId)

    const currentPreview = latestPreviewRecord.current
    if (currentPreview) {
      void useEventSimulationStore.getState().previewEvent(currentPreview).then(() => {
        if (!cancelled && !useEventSimulationStore.getState().activeEvent) {
          useSelectionStore.getState().setSelected({ kind: 'event', idx: 0 })
        }
      })
    }

    return () => {
      cancelled = true
      leaving.current = true
      useEventSimulationStore.getState().clearPreview()
      eventSceneController.clear(contextId)
      if (
        !useEventSimulationStore.getState().activeEvent &&
        useSelectionStore.getState().selected?.kind === 'event'
      ) {
        useSelectionStore.getState().setSelected(null)
      }
    }
  }, [contextId])

  useEffect(() => {
    const current = latestAnalysis.current
    if (!current?.capabilities.nBody || current.contextId !== contextId) return
    void eventSceneController.ensureOrbitPropagation(eventSceneCommandContextFromAnalysis(current))
  }, [contextId])

  useEffect(() => {
    leaving.current = false
    if (!eventKey) return
    return useSelectionStore.subscribe((state) => {
      if (leaving.current || state.selected || useEventSimulationStore.getState().activeEvent) return
      useSelectionStore.getState().setSelected({ kind: 'event', idx: 0 })
    })
  }, [eventKey])
}
