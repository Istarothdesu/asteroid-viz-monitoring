import { useRef, useState, type PointerEvent } from 'react'
import { ChevronsLeft, ChevronsRight, RotateCcw } from 'lucide-react'
import PlaybackToggle from '@/components/bottom/timeline/PlaybackToggle'
import TimelineTrack from '@/components/bottom/timeline/TimelineTrack'
import { Button } from '@/components/ui/button'
import { HudCorners } from '@/components/ui/Panel'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TooltipProvider } from '@/components/ui/tooltip'
import { fmtJD } from '@/utils/orbital/time'
import type { useEventSimulationTimeline } from './useEventSimulationTimeline'

const speeds = [.25, .45, 1, 2, 8, 60, 600]
type Timeline = ReturnType<typeof useEventSimulationTimeline>

/** 秒级过程时间轴；复用主时间轴的外壳、轨道和播放控件，但不套用日历窗口模型。 */
export default function EventSimulationTimelineBar({ timeline }: { timeline: Timeline }) {
  const { state, event, ready, jd, jdMin, duration, elapsed, rate,
    playing, manualRate, seek, togglePlaying, replay, setRate } = timeline
  const trackRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ pct: number; text: string } | null>(null)

  const secondsAtPointer = (pointerEvent: PointerEvent<HTMLDivElement>) => {
    const rect = pointerEvent.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(1, (pointerEvent.clientX - rect.left) / rect.width)) * duration
  }
  const showHover = (pointerEvent: PointerEvent<HTMLDivElement>) => {
    if (!ready) return
    const seconds = secondsAtPointer(pointerEvent)
    setHover({
      pct: duration ? seconds / duration * 100 : 0,
      text: `${seconds.toFixed(1)} s · ${fmtJD(jdMin + seconds / 86400)}`,
    })
  }
  const marks = event ? [
    { key: 'start', time: 0, label: '太空接近' },
    { key: 'entry', time: event.entryTime, label: '进入大气' },
    { key: 'impact', time: event.impactTime, label: '地表撞击' },
    { key: 'aftermath', time: event.impactTime + 10, label: '撞击后' },
  ] : []
  const step = event ? 1 : 60

  return <footer className="hud-panel pointer-events-auto relative rounded-sm px-3 py-2">
    <HudCorners />
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <PlaybackToggle playing={playing} disabled={!ready} onToggle={togglePlaying} />
        <Button variant="hud" size="sm" disabled={!ready} onClick={replay}><RotateCcw data-icon="inline-start" />重新播放</Button>
        <Select value={state.automaticRate && event ? 'auto' : String(manualRate)} onValueChange={setRate} disabled={!ready}>
          <SelectTrigger size="sm" className="w-[112px]" aria-label="仿真播放速度"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>
            {event && <SelectItem value="auto">自动变速</SelectItem>}
            {speeds.map(speed => <SelectItem key={speed} value={String(speed)}>{speed}×</SelectItem>)}
          </SelectGroup></SelectContent>
        </Select>
        <span className="text-[10px] tabular-nums text-sky-400/80">{playing ? `${rate}×` : '已暂停'}</span>
      </div>
      <div className="flex items-center gap-3 text-[10px] tabular-nums">
        <output className="text-sky-100" aria-label="仿真经过时间">{elapsed.toFixed(1)} / {duration.toFixed(1)} s</output>
        <span className="text-sky-400/70">{fmtJD(jd)}</span>
      </div>
    </div>

    <TooltipProvider delayDuration={120}>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <Button variant="hud" size="icon-sm" disabled={!ready} onClick={() => seek(elapsed - step)} title="后退一个精细步长" aria-label="后退一个精细步长"><ChevronsLeft /></Button>
        <div className="min-w-0 flex-1">
          <TimelineTrack
            trackRef={trackRef}
            currentPercent={duration ? elapsed / duration * 100 : 0}
            startLabel={event ? '太空接近 · 0 s' : '仿真开始'}
            endLabel={event ? `撞击后 · ${duration.toFixed(0)} s` : '仿真结束'}
            marks={marks.map(mark => ({
              key: mark.key,
              label: `${mark.label} · ${mark.time.toFixed(1)} s`,
              pct: duration ? mark.time / duration * 100 : 0,
              icon: <span className="block size-2 rotate-45 border border-orange-200 bg-orange-400 shadow-[0_0_6px_#fb923c]" />,
              onClick: () => seek(mark.time),
            }))}
            hoverPoint={hover}
            disabled={!ready}
            onPointerDown={pointerEvent => {
              if (!ready) return
              pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId)
              showHover(pointerEvent)
              seek(secondsAtPointer(pointerEvent))
            }}
            onPointerMove={pointerEvent => {
              showHover(pointerEvent)
              if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) seek(secondsAtPointer(pointerEvent))
            }}
            onPointerEnd={pointerEvent => {
              if (pointerEvent.currentTarget.hasPointerCapture(pointerEvent.pointerId)) pointerEvent.currentTarget.releasePointerCapture(pointerEvent.pointerId)
            }}
            onPointerEnter={showHover}
            onPointerLeave={() => setHover(null)}
          />
        </div>
        <Button variant="hud" size="icon-sm" disabled={!ready} onClick={() => seek(elapsed + step)} title="前进一个精细步长" aria-label="前进一个精细步长"><ChevronsRight /></Button>
      </div>
    </TooltipProvider>
  </footer>
}
