import type { PointerEventHandler, ReactNode, RefObject } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export interface TimelineTrackMark {
  key: string
  pct: number
  label: string
  icon: ReactNode
  onClick: () => void
}

interface TimelineTrackProps {
  trackRef?: RefObject<HTMLDivElement | null>
  marks: TimelineTrackMark[]
  currentPercent: number
  hoverPoint?: { pct: number; text: string } | null
  startLabel: string
  endLabel: string
  disabled?: boolean
  onPointerDown?: PointerEventHandler<HTMLDivElement>
  onPointerMove?: PointerEventHandler<HTMLDivElement>
  onPointerEnd?: PointerEventHandler<HTMLDivElement>
  onPointerEnter?: PointerEventHandler<HTMLDivElement>
  onPointerLeave?: PointerEventHandler<HTMLDivElement>
}

/** 只负责绘制时间轨道；日历时间与撞击秒数由各自的控制器换算。 */
export default function TimelineTrack({
  trackRef, marks, currentPercent, hoverPoint, startLabel, endLabel, disabled,
  onPointerDown, onPointerMove, onPointerEnd, onPointerEnter, onPointerLeave,
}: TimelineTrackProps) {
  return <div
    ref={trackRef}
    data-testid="simulation-timeline-track"
    className={`relative h-[50px] select-none ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerEnd}
    onPointerCancel={onPointerEnd}
    onPointerEnter={onPointerEnter}
    onPointerLeave={onPointerLeave}
  >
    {hoverPoint && <div
      data-testid="timeline-hover-time"
      className="pointer-events-none absolute -top-5 z-30 -translate-x-1/2 whitespace-nowrap rounded-sm border border-sky-300/35 bg-slate-950/95 px-1.5 py-0.5 text-[9px] text-sky-100 shadow-[0_0_8px_rgba(56,189,248,0.3)]"
      style={{ left: `${hoverPoint.pct}%` }}
    >{hoverPoint.text}</div>}

    {marks.map(mark => <Tooltip key={mark.key}>
      <TooltipTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={mark.label}
          onPointerDown={event => event.stopPropagation()}
          onClick={mark.onClick}
          className="absolute top-0 z-10 flex -translate-x-1/2 cursor-pointer flex-col items-center gap-0.5"
          style={{ left: `${mark.pct}%` }}
        >{mark.icon}</button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>{mark.label}</TooltipContent>
    </Tooltip>)}

    <div className="absolute left-0 right-0 top-[18px] h-[10px] overflow-hidden rounded-sm border border-sky-400/20 bg-[repeating-linear-gradient(90deg,rgba(56,189,248,0.14)_0_1px,transparent_1px_5%)]">
      <div className="h-full bg-gradient-to-r from-sky-500/20 via-sky-400/55 to-sky-200/90 shadow-[0_0_8px_rgba(125,211,252,0.65)]" style={{ width: `${currentPercent}%` }} />
    </div>
    {marks.map(mark => <div key={`${mark.key}-tick`} className="absolute top-[12px] h-[20px] w-px bg-orange-300/70" style={{ left: `${mark.pct}%` }} />)}
    <div data-testid="timeline-playhead" className="pointer-events-none absolute top-[13px] -translate-x-1/2" style={{ left: `${currentPercent}%` }}>
      <span className="block size-3 rotate-45 border border-white bg-sky-200 shadow-[0_0_10px_#7dd3fc]" />
    </div>
    <span className="absolute bottom-0 left-0 text-[9px] text-sky-500/80 tabular-nums">{startLabel}</span>
    <span className="absolute bottom-0 right-0 text-[9px] text-sky-500/80 tabular-nums">{endLabel}</span>
  </div>
}
