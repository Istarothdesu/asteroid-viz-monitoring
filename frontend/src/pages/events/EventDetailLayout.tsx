import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import SceneOverlays from '@/components/layout/SceneOverlays'
import { TransitionGroup } from '@/components/common/transition'
import { LoadingOverlay } from '@/components/ui/Loading'
import EventDetailLeftColumn from '@/features/events/detail/EventDetailLeftColumn'
import EventDetailRightColumn from '@/features/events/detail/EventDetailRightColumn'
import { FRAME_INFO, useFrameStore } from '@/store/frameStore'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useLiveJd } from '@/hooks/useLiveJd'
import { useThrottledNowJd } from '@/hooks/useThrottledNowJd'
import { useEventAnalysisContext } from '@/features/event-analysis/useEventAnalysisContext'
import { eventPreviewRecord, orbitElementsView } from '@/features/event-analysis/presentation'
import { useEventSceneStore } from '@/features/event-analysis/eventSceneStore'
import { useSceneProductStore } from '@/core/sceneProducts/store'
import EventCountdownBanner from '@/features/events/detail/EventCountdownBanner'
import { useEventDetailSceneLifecycle } from '@/features/events/detail/useEventDetailSceneLifecycle'
import { SOURCE_META } from '@/services/eventCenter'

/** 事件专题布局只组合左右信息列、中央场景与加载状态。 */
export default function EventDetailLayout() {
  const frame = useFrameStore((state) => state.frame)
  const { key = '' } = useParams()
  const replaying = useEventSimulationStore((state) => !!state.activeEvent)
  const jd = useLiveJd(1000, 1)
  const referenceJd = useThrottledNowJd(jd, !replaying)
  const { context: analysis, state: detailState } = useEventAnalysisContext(key, referenceJd)
  const event = analysis?.event ?? null
  // 派生模型必须随分析上下文保持引用稳定；否则场景任务状态更新会被误判为换事件。
  const orbit = useMemo(
    () => analysis ? orbitElementsView(analysis) : null,
    [analysis],
  )
  const previewRecord = useMemo(
    () => analysis ? eventPreviewRecord(analysis) : null,
    [analysis],
  )
  const orbitState = !event?.cad ? 'idle' : analysis?.orbit ? 'ok' : 'err'

  const propagationContextId = useEventSceneStore((state) => state.contextId)
  const propagationTask = useEventSceneStore((state) => state.tasks.propagation)
  const trajectoryContextId = useSceneProductStore(
    (state) => state.products.trajectory?.contextId ?? null,
  )
  const trajectoryReady = !!analysis && trajectoryContextId === analysis.contextId
  const trajectoryFailed = !!analysis
    && propagationContextId === analysis.contextId
    && propagationTask.state === 'error'
  const trajectoryPending = !!analysis?.capabilities.nBody
    && !trajectoryReady
    && !trajectoryFailed

  useEventDetailSceneLifecycle({
    analysis,
    event,
    previewRecord,
    replaying,
  })

  if (!analysis || !event) {
    return (
      <div className="relative size-full overflow-hidden pointer-events-none">
        <div className="absolute left-2.5 top-[10px] z-[16] w-[var(--left-col-w)] rounded-sm px-4 py-6 text-center hud-panel pointer-events-auto">
          <div className="mb-3 text-[12px] text-sky-300/80">
            {detailState === 'loading'
              ? '正在调取事件记录…'
              : detailState === 'err'
                ? '事件记录调取失败，后端或网络异常'
                : '未找到该事件记录'}
          </div>
          <button
            type="button"
            onClick={() => history.back()}
            className="cursor-pointer rounded-sm border border-sky-400/25 px-3 py-1.5 text-[12px] text-sky-300/90 transition-all hover:border-sky-300/70 hover:text-sky-100"
          >
            返回事件中心
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex size-full flex-col overflow-hidden pointer-events-none">
      <div className="flex min-h-0 flex-1 pt-[10px]">
        {!replaying && (
          <div className="w-[var(--left-col-w)] shrink-0 overflow-y-auto pb-[calc(var(--timeline-h)+8px)] pl-2.5 hud-scroll pointer-events-auto">
            <TransitionGroup
              k={`event-left-${event.key}`}
              side="left"
              className="flex h-full flex-col gap-2.5 pointer-events-auto"
            >
              <EventDetailLeftColumn event={event} cadRecord={previewRecord} analysis={analysis} />
            </TransitionGroup>
          </div>
        )}

        <div className="relative min-w-0 flex-1 pointer-events-none">
          {!replaying && (
            <div className="absolute left-1/2 top-[16px] z-20 -translate-x-1/2">
              <EventCountdownBanner event={event} />
            </div>
          )}
          <SceneOverlays
            profile="event-detail"
            showClock={false}
            caption={!replaying ? `${FRAME_INFO[frame].label} · 事件专题 · ${SOURCE_META[event.source].label}` : undefined}
            captionTop={128}
            hintExtra="进入仿真查看已支持的过程演示"
          />
          <LoadingOverlay
            visible={!replaying && trajectoryPending}
            fullscreen={false}
            delay={120}
            text="正在生成事件名义轨道…"
            subText="完整公转周期 · N 体传播 · ECLIPJ2000 / TDB"
          />
        </div>

        {!replaying && (
          <div className="w-[var(--right-col-w)] shrink-0 overflow-y-auto pb-[calc(var(--timeline-h)+8px)] pr-2.5 hud-scroll pointer-events-auto">
            <TransitionGroup
              k={`event-right-${event.key}`}
              side="right"
              className="flex h-full flex-col gap-2.5 pointer-events-auto"
            >
              <EventDetailRightColumn
                event={event}
                orbit={orbit}
                orbitState={orbitState}
                cadRecord={previewRecord}
                analysis={analysis}
              />
            </TransitionGroup>
          </div>
        )}
      </div>
    </div>
  )
}
