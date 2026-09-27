import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useEventMarksStore, type TimelineMark } from '@/store/eventMarksStore'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { dateToJD } from '@/utils/orbital/time'

export function useTimelineMarks({
  jd,
  jdMin,
  jdMax,
  visibleMin,
  visibleMax,
  visibleSpan,
}: {
  jd: number
  jdMin: number
  jdMax: number
  visibleMin: number
  visibleMax: number
  visibleSpan: number
}) {
  const pageMarks = useEventMarksStore((state) => state.marks)
  const activeEvent = useEventSimulationStore((state) => state.activeEvent)
  const previewRecord = useEventSimulationStore((state) => state.previewRec)
  const { pathname } = useLocation()
  const isEventCenter = pathname.replace(/\/+$/, '') === '/events'

  const allMarks = useMemo(() => {
    const list: TimelineMark[] = []
    if (previewRecord) {
      const record = activeEvent ?? previewRecord
      list.push({
        key: `focus-${record.id}`,
        jd: dateToJD(new Date(record.dateUTC)),
        kind: 'replay',
        label: `${activeEvent ? '仿真' : '聚焦'}事件: ${record.name}`,
      })
    } else {
      if (isEventCenter) list.push(...pageMarks)
      if (activeEvent) {
        list.push({
          key: `replay-${activeEvent.id}`,
          jd: dateToJD(new Date(activeEvent.dateUTC)),
          kind: 'replay',
          label: `仿真事件: ${activeEvent.name}`,
        })
      }
    }
    return list
      .filter((mark) => mark.jd >= jdMin && mark.jd <= jdMax)
      .sort((left, right) => left.jd - right.jd)
  }, [activeEvent, isEventCenter, jdMin, jdMax, pageMarks, previewRecord])

  const marks = useMemo(
    () => allMarks
      .filter((mark) => mark.jd >= visibleMin && mark.jd <= visibleMax)
      .map((mark) => ({
        ...mark,
        pct: ((mark.jd - visibleMin) / visibleSpan) * 100,
      })),
    [allMarks, visibleMin, visibleMax, visibleSpan],
  )

  return {
    marks,
    previousMark: [...allMarks].reverse().find((mark) => mark.jd < jd),
    nextMark: allMarks.find((mark) => mark.jd > jd),
  }
}
