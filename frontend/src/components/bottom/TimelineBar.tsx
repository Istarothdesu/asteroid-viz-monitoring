import { HudCorners } from '@/components/ui/Panel'
import { TooltipProvider } from '@/components/ui/tooltip'
import { speedIndexOf } from '@/store/simStore'
import { useUIStore } from '@/store/uiStore'
import { formatL1Time } from '@/features/l1/store'
import { useMissionClock } from '@/features/l1/useMissionClock'
import TimelineNavigation from './timeline/TimelineNavigation'
import TimelinePlaybackControls from './timeline/TimelinePlaybackControls'
import TimelineRangeControls from './timeline/TimelineRangeControls'
import { clamp, formatTimelineBoundary, formatUtcDateTime } from './timeline/model'
import { useTimelineMarks } from './timeline/useTimelineMarks'
import { useTimelineRangeInputs } from './timeline/useTimelineRangeInputs'
import { useTimelineViewport } from './timeline/useTimelineViewport'

/** 时间轴容器只组合播放、导航与范围控件，交互状态由专用 Hook 管理。 */
export default function TimelineBar() {
  const isL1 = useUIStore((state) => state.mode === 'survey')
  const viewport = useTimelineViewport()
  useMissionClock(viewport.jd, isL1)

  const rangeInputs = useTimelineRangeInputs({
    isL1,
    jdMin: viewport.jdMin,
    jdMax: viewport.jdMax,
    revealJD: viewport.revealJD,
    applySimulationRange: viewport.applySimulationRange,
  })
  const { marks, previousMark, nextMark } = useTimelineMarks({
    jd: viewport.jd,
    jdMin: viewport.jdMin,
    jdMax: viewport.jdMax,
    visibleMin: viewport.min,
    visibleMax: viewport.max,
    visibleSpan: viewport.span,
  })

  const currentPercent = clamp(
    ((viewport.jd - viewport.min) / viewport.span) * 100,
    0,
    100,
  )
  const detailedWindow = viewport.span < 366
  const formatTime = (value: number) => (
    isL1 ? formatL1Time(value) : `${formatUtcDateTime(value)} UTC`
  )

  return (
    <footer className="hud-panel pointer-events-auto relative rounded-sm px-3 py-2">
      <HudCorners />
      <TooltipProvider delayDuration={120}>
        <TimelinePlaybackControls
          playing={viewport.playing}
          playRate={viewport.playRate}
          rateIndex={speedIndexOf(viewport.playRate)}
          currentTimeText={formatTime(viewport.jd)}
          onToday={() => void rangeInputs.goToToday()}
          onTogglePlaying={() => viewport.setPlaying(!viewport.playing)}
          onRateChange={viewport.setPlayRate}
        />
        <TimelineNavigation
          trackRef={viewport.trackRef}
          marks={marks}
          previousMark={previousMark}
          nextMark={nextMark}
          currentPercent={currentPercent}
          hoverPoint={viewport.hoverPoint}
          startLabel={isL1
            ? formatL1Time(viewport.min)
            : formatTimelineBoundary(viewport.min, detailedWindow)}
          endLabel={isL1
            ? formatL1Time(viewport.max)
            : formatTimelineBoundary(viewport.max, detailedWindow)}
          formatHoverTime={formatTime}
          onReveal={viewport.revealJD}
          onStep={viewport.stepTime}
          onPointerDown={viewport.onPointerDown}
          onPointerMove={viewport.onPointerMove}
          onPointerEnd={viewport.onPointerEnd}
          onPointerEnter={viewport.onPointerEnter}
          onPointerLeave={viewport.onPointerLeave}
        />
        <TimelineRangeControls
          scaleDays={viewport.scaleDays}
          startText={rangeInputs.startText}
          endText={rangeInputs.endText}
          onScaleChange={viewport.changeScale}
          onStartTextChange={rangeInputs.setStartText}
          onEndTextChange={rangeInputs.setEndText}
          onCommitBoundary={(kind, value) => {
            void rangeInputs.commitBoundary(kind, value)
          }}
        />
      </TooltipProvider>
      {rangeInputs.timeError && (
        <div role="status" className="mt-1 text-center text-[10px] text-destructive">
          {rangeInputs.timeError}
        </div>
      )}
    </footer>
  )
}
