import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { fetchEvents } from '@/api/client'
import { useLiveJd } from '@/hooks/useLiveJd'
import { useDataStore } from '@/store/dataStore'
import { useEventMarksStore, type TimelineMark } from '@/store/eventMarksStore'
import { useSimEventStore } from '@/store/simEventStore'
import { isoDay, type DateRangeValue } from '@/components/ui/dateRangeModel'
import { jdToDate, nowJD } from '@/utils/orbital/time'
import {
  LD_KM,
  SOURCE_META,
  type EventCategory,
  type EventItem,
  type EventPage,
  type EventSeverity,
  type EventSource,
  type EventType,
} from '@/services/eventCenter'

export type EventTab = 'all' | EventCategory | 'sim'
export type EventTimeBasis = 'system' | 'simulation'

const PAGE_SIZE = 10
const KW_DEBOUNCE = 280
const PRESET_DAYS: Record<string, number | undefined> = {
  '30d': 30,
  '180d': 180,
  '365d': 365,
  all: undefined,
}

function rangeParams(range: DateRangeValue, referenceJd: number) {
  if (range.kind === 'custom') return { dateFrom: range.from, dateTo: range.to }
  const days = PRESET_DAYS[range.key]
  if (days == null) return {}
  return {
    dateFrom: isoDay(jdToDate(referenceJd)),
    dateTo: isoDay(jdToDate(referenceJd + days)),
  }
}

function toTimelineMark(event: EventItem): TimelineMark {
  const metric = event.type === 'impact'
    ? event.energyMt != null ? `能量 ${event.energyMt} Mt TNT` : ''
    : event.missKm != null
      ? `最近 ${event.missKm < LD_KM ? `${Math.round(event.missKm).toLocaleString()} km` : `${(event.missKm / LD_KM).toFixed(2)} LD`}`
      : ''
  return {
    key: event.key,
    jd: event.jdEnc,
    kind: event.type === 'impact' ? 'impact' : event.source === 'cad' ? 'cad' : 'flyby',
    label: `${SOURCE_META[event.source].label} · ${event.name}${metric ? ` (${metric})` : ''}`,
  }
}

export interface EventCatalogModel {
  tab: EventTab
  setTab: (tab: EventTab) => void
  keyword: string
  setKeyword: Dispatch<SetStateAction<string>>
  type: 'all' | EventType
  setType: Dispatch<SetStateAction<'all' | EventType>>
  source: 'all' | EventSource
  setSource: Dispatch<SetStateAction<'all' | EventSource>>
  severity: 'all' | EventSeverity
  setSeverity: Dispatch<SetStateAction<'all' | EventSeverity>>
  range: DateRangeValue
  setRange: Dispatch<SetStateAction<DateRangeValue>>
  page: number
  setPage: Dispatch<SetStateAction<number>>
  response: EventPage | null
  rows: EventItem[]
  loading: boolean
  error: string | null
  filtered: boolean
  timeBasis: EventTimeBasis
  referenceJd: number
  liveSimulationJd: number
  simulationDriftDays: number
  useSystemTime: () => void
  useSimulationTime: () => void
  syncSimulationTime: () => void
}

/** 事件目录唯一状态入口：筛选、分页、统计和时间基准共享同一请求模型。 */
export function useEventCatalog(): EventCatalogModel {
  const liveSimulationJd = useLiveJd(1000, 1 / 1440)
  const simRevision = useSimEventStore(state => state.revision)
  const [timeBasis, setTimeBasis] = useState<EventTimeBasis>('system')
  const [referenceJd, setReferenceJd] = useState(nowJD)
  const [tabState, setTabState] = useState<EventTab>('all')
  const [keyword, setKeyword] = useState('')
  const [queryKeyword, setQueryKeyword] = useState('')
  const [type, setType] = useState<'all' | EventType>('all')
  const [source, setSource] = useState<'all' | EventSource>('all')
  const [severity, setSeverity] = useState<'all' | EventSeverity>('all')
  const [range, setRange] = useState<DateRangeValue>({ kind: 'preset', key: 'all' })
  const [page, setPage] = useState(1)
  const [response, setResponse] = useState<EventPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setTab = useCallback((next: EventTab) => {
    setTabState(previous => {
      if (next === 'sim') setSource('sim')
      else if (previous === 'sim') setSource('all')
      return next
    })
  }, [])

  const useSystemTime = useCallback(() => {
    setTimeBasis('system')
    setReferenceJd(nowJD())
  }, [])
  const syncSimulationTime = useCallback(() => {
    setTimeBasis('simulation')
    setReferenceJd(liveSimulationJd)
  }, [liveSimulationJd])
  const useSimulationTime = syncSimulationTime

  useEffect(() => {
    const timer = window.setTimeout(() => setQueryKeyword(keyword.trim()), KW_DEBOUNCE)
    return () => window.clearTimeout(timer)
  }, [keyword])

  useEffect(() => {
    setPage(1)
  }, [tabState, queryKeyword, type, source, severity, range, referenceJd])

  const requestSequence = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    const sequence = ++requestSequence.current
    setLoading(true)
    fetchEvents({
      page,
      size: PAGE_SIZE,
      q: queryKeyword || undefined,
      type: type === 'all' ? undefined : type,
      source: source === 'all' ? undefined : source,
      severity: severity === 'all' ? undefined : severity,
      category: tabState === 'current' || tabState === 'upcoming' || tabState === 'past'
        ? tabState
        : undefined,
      nowJd: referenceJd,
      ...rangeParams(range, referenceJd),
      signal: controller.signal,
    })
      .then(data => {
        if (sequence !== requestSequence.current) return
        setResponse(data)
        setError(null)
        if (data.page !== page) setPage(data.page)
        useDataStore.getState().setEventCounts(data.counts)
      })
      .catch(() => {
        if (sequence === requestSequence.current) setError('事件目录加载失败，后端或网络异常')
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false)
      })
    return () => controller.abort()
  }, [page, queryKeyword, type, source, severity, tabState, range, referenceJd, simRevision])

  useEffect(() => {
    useEventMarksStore.getState().setMarks((response?.data ?? []).map(toTimelineMark))
  }, [response])
  useEffect(() => () => useEventMarksStore.getState().clearMarks(), [])

  const filtered = useMemo(() => (
    tabState !== 'all' || !!queryKeyword || type !== 'all' || source !== 'all' ||
    severity !== 'all' || range.kind === 'custom' ||
    (range.kind === 'preset' && range.key !== 'all')
  ), [queryKeyword, range, severity, source, tabState, type])

  return {
    tab: tabState,
    setTab,
    keyword,
    setKeyword,
    type,
    setType,
    source,
    setSource,
    severity,
    setSeverity,
    range,
    setRange,
    page,
    setPage,
    response,
    rows: response?.data ?? [],
    loading,
    error,
    filtered,
    timeBasis,
    referenceJd,
    liveSimulationJd,
    simulationDriftDays: timeBasis === 'simulation' ? liveSimulationJd - referenceJd : 0,
    useSystemTime,
    useSimulationTime,
    syncSimulationTime,
  }
}
