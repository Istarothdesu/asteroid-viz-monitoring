import { useNavigate } from 'react-router-dom'
import { Crosshair, Orbit, Play } from 'lucide-react'
import { DetailPageHeader } from '@/components/common/atoms'
import { fetchAsteroidByDes } from '@/api/client'
import { useFrameStore } from '@/store/frameStore'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useSimStore } from '@/store/simStore'
import { useUIStore } from '@/store/uiStore'
import type { EventAnalysisContext } from '@/features/event-analysis/types'
import {
  eventSceneCommandContextFromAnalysis,
  eventSceneController,
} from '@/features/event-analysis/EventSceneController'
import { useEventSceneStore } from '@/features/event-analysis/eventSceneStore'
import type { EventRecord } from '@/types/scene'
import {
  SEVERITY_META,
  cadToRecord,
  type EventDetail,
} from '@/services/eventCenter'
import {
  EventDescriptionPanel,
  EventInfoPanel,
  EventRiskParametersPanel,
  EventTimelinePanel,
} from './EventSummaryPanels'
import EventTrajectoryPanel from './EventTrajectoryPanel'

const ACTION_BUTTON_CLASS =
  'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm text-[12px] tracking-[1px] cursor-pointer transition-all whitespace-nowrap'

export default function EventDetailLeftColumn({
  event,
  cadRecord,
  analysis,
}: {
  event: EventDetail
  cadRecord: EventRecord | null
  analysis: EventAnalysisContext
}) {
  const navigate = useNavigate()
  const startSimulation = useEventSimulationStore((state) => state.startSimulation)
  const setJD = useSimStore((state) => state.setJD)
  const setPlaying = useSimStore((state) => state.setPlaying)
  const setFrame = useFrameStore((state) => state.setFrame)
  const sceneContextId = useEventSceneStore((state) => state.contextId)
  const propagationTask = useEventSceneStore((state) => state.tasks.propagation)

  const severity = SEVERITY_META[event.severity]
  const record = event.record ?? cadRecord
  const discoveryJd = event.jdEnc - event.leadH / 24
  const propagationFailed = sceneContextId === analysis.contextId
    && propagationTask.state === 'error'
  const commandContext = eventSceneCommandContextFromAnalysis(analysis)

  const handleReplay = async () => {
    let replayRecord = record
    if (!replayRecord && event.cad) {
      const { showLoading, hideLoading } = useUIStore.getState()
      showLoading('正在查询轨道数据…', `SBDB 检索 ${event.cad.des}`)
      try {
        const dto = await fetchAsteroidByDes(event.cad.des)
        replayRecord = cadToRecord(event.cad, {
          a: dto.a,
          e: dto.e,
          i: dto.i,
          O: dto.O,
          w: dto.w,
          des: dto.des,
        })
      } catch {
        alert('查询该天体轨道数据失败, 后端或网络异常')
        return
      } finally {
        hideLoading()
      }
    }
    if (replayRecord) await startSimulation(replayRecord)
  }

  const jumpToEvent = () => {
    setFrame('helio')
    setJD(discoveryJd)
    setPlaying(true)
  }

  return (
    <>
      <DetailPageHeader
        backLabel="事件中心"
        onBack={() => navigate('/events')}
        title="事件专题"
        accentColor={severity.color}
      />
      <EventInfoPanel event={event} record={record} />
      <EventTimelinePanel event={event} />
      <EventRiskParametersPanel event={event} record={record} />
      <EventTrajectoryPanel event={event} analysis={analysis} />
      <EventDescriptionPanel record={record} />

      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={() => void handleReplay()}
          className={`${ACTION_BUTTON_CLASS} border text-sky-50`}
          style={{
            background: `linear-gradient(90deg, ${severity.color}cc, ${severity.color}99)`,
            borderColor: `${severity.color}66`,
          }}
        >
          <Play size={13} /> 开始仿真
        </button>
        <button
          type="button"
          onClick={jumpToEvent}
          className={`${ACTION_BUTTON_CLASS} hud-btn border border-sky-400/35 text-sky-200 hover:border-sky-300/70`}
        >
          <Crosshair size={13} /> 跳转事件时刻
        </button>
        {analysis.capabilities.nBody && propagationFailed && (
          <button
            type="button"
            onClick={() => void eventSceneController.propagateOrbit(commandContext)}
            className={`${ACTION_BUTTON_CLASS} hud-btn border border-orange-400/35 text-orange-200 hover:border-orange-300/70`}
          >
            <Orbit size={13} /> 重新推演轨道
          </button>
        )}
      </div>
      {propagationFailed && (
        <div className="text-[10px] text-orange-300/80">{propagationTask.message}</div>
      )}
    </>
  )
}
