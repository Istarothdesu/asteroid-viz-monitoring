import { useEffect, useMemo, useRef } from 'react'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useSelectionStore } from '@/store/selectionStore'
import { useSimStore } from '@/store/simStore'
import { defaultSimulationRange } from '@/utils/orbital/time'
import type { SimEventFormData } from './types'
import {
  buildSimEventRecord,
  canPreviewSimEvent,
  simulationEncounterJd,
  simulationPreviewKey,
} from './model'

/** 管理新建事件页面的防抖预览、仿真窗口同步与离场清理。 */
export function useSimEventPreview(
  formData: SimEventFormData,
  replaying: boolean,
) {
  const latestForm = useRef(formData)
  const previewSequence = useRef(0)
  latestForm.current = formData

  const previewKey = useMemo(() => simulationPreviewKey(formData), [formData])

  useEffect(() => {
    if (useEventSimulationStore.getState().activeEvent) return
    const current = latestForm.current
    if (!canPreviewSimEvent(current)) {
      const replay = useEventSimulationStore.getState()
      replay.clearPreview()
      if (useSelectionStore.getState().selected?.kind === 'event') {
        useSelectionStore.getState().setSelected(null)
      }
      return
    }

    const timer = setTimeout(() => {
      const record = buildSimEventRecord(
        `create-preview-${++previewSequence.current}`,
        latestForm.current,
      )
      void useEventSimulationStore.getState().previewEvent(record).then(() => {
        if (!useEventSimulationStore.getState().activeEvent) {
          useSelectionStore.getState().setSelected({ kind: 'event', idx: 0 })
        }
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [previewKey])

  const encounterJd = simulationEncounterJd(formData)
  useEffect(() => {
    if (replaying || !Number.isFinite(encounterJd)) return

    const leadDays = formData.leadH / 24
    const window = formData.type === 'impact'
      ? {
          start: encounterJd - Math.max(leadDays + 0.5, 3),
          end: encounterJd + 0.5,
        }
      : {
          start: encounterJd - Math.max(leadDays * 1.5, 10),
          end: encounterJd + 10,
        }
    const simulation = useSimStore.getState()
    simulation.setSimulationRange(window.start, window.end)
    simulation.setJD(encounterJd)

    return () => {
      if (!useEventSimulationStore.getState().activeEvent) {
        useSimStore.getState().setSimulationRange(...defaultSimulationRange())
      }
    }
  }, [encounterJd, formData.leadH, formData.type, replaying])

  useEffect(
    () => () => {
      const replay = useEventSimulationStore.getState()
      replay.clearPreview()
      if (
        !replay.activeEvent
        && useSelectionStore.getState().selected?.kind === 'event'
      ) {
        useSelectionStore.getState().setSelected(null)
      }
    },
    [],
  )
}
