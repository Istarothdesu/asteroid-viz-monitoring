import type { PointerEventHandler, RefObject } from 'react'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  TriangleAlert,
} from 'lucide-react'
import type { MarkKind, TimelineMark } from '@/store/eventMarksStore'
import TimelineTrack from './TimelineTrack'

type PositionedMark = TimelineMark & { pct: number }

interface TimelineNavigationProps {
  trackRef: RefObject<HTMLDivElement | null>
  marks: PositionedMark[]
  previousMark?: TimelineMark
  nextMark?: TimelineMark
  currentPercent: number
  hoverPoint: { jd: number; pct: number } | null
  startLabel: string
  endLabel: string
  formatHoverTime: (jd: number) => string
  onReveal: (jd: number, recenter?: boolean) => void
  onStep: (direction: -1 | 1) => void
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerEnd: PointerEventHandler<HTMLDivElement>
  onPointerEnter: PointerEventHandler<HTMLDivElement>
  onPointerLeave: PointerEventHandler<HTMLDivElement>
}

function Marker({ kind }: { kind: MarkKind }) {
  switch (kind) {
    case 'cad':
      return <TriangleAlert size={11} className="text-amber-300" fill="#fcd34d" />
    case 'impact':
      return <AlertTriangle size={13} className="text-red-400" fill="#f87171" />
    case 'flyby':
      return <span className="text-[11px] leading-none text-sky-300 glow-text">✦</span>
    case 'replay':
      return <span className="size-2.5 bg-orange-400 shadow-[0_0_6px_#fb923c]" />
  }
}

export default function TimelineNavigation({
  trackRef,
  marks,
  previousMark,
  nextMark,
  currentPercent,
  hoverPoint,
  startLabel,
  endLabel,
  formatHoverTime,
  onReveal,
  onStep,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onPointerEnter,
  onPointerLeave,
}: TimelineNavigationProps) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <button
        type="button"
        disabled={!previousMark}
        onClick={() => previousMark && onReveal(previousMark.jd, true)}
        title={previousMark?.label ?? '没有上一个事件'}
        className="flex h-7 shrink-0 items-center gap-0.5 rounded-sm border border-sky-400/25 px-1.5 text-[9px] text-sky-300 disabled:opacity-30 hover:not-disabled:border-sky-300/70"
      >
        <ChevronLeft size={12} />
        <span className="hidden 2xl:inline">上一事件</span>
      </button>

      <button
        type="button"
        onClick={() => onStep(-1)}
        title="后退一个精细步长"
        className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-sky-400/30 text-sky-200 hover:border-sky-300/70 hover:bg-sky-400/15"
      >
        <ChevronsLeft size={14} />
      </button>

      <div className="min-w-0 flex-1">
        <TimelineTrack
          trackRef={trackRef}
          marks={marks.map(mark => ({
            key: mark.key, pct: mark.pct, label: mark.label,
            icon: <Marker kind={mark.kind} />,
            onClick: () => onReveal(mark.jd),
          }))}
          currentPercent={currentPercent}
          hoverPoint={hoverPoint && { pct: hoverPoint.pct, text: formatHoverTime(hoverPoint.jd) }}
          startLabel={startLabel}
          endLabel={endLabel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerEnd={onPointerEnd}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
        />
      </div>

      <button
        type="button"
        onClick={() => onStep(1)}
        title="前进一个精细步长"
        className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-sky-400/30 text-sky-200 hover:border-sky-300/70 hover:bg-sky-400/15"
      >
        <ChevronsRight size={14} />
      </button>

      <button
        type="button"
        disabled={!nextMark}
        onClick={() => nextMark && onReveal(nextMark.jd, true)}
        title={nextMark?.label ?? '没有下一个事件'}
        className="flex h-7 shrink-0 items-center gap-0.5 rounded-sm border border-sky-400/25 px-1.5 text-[9px] text-sky-300 disabled:opacity-30 hover:not-disabled:border-sky-300/70"
      >
        <span className="hidden 2xl:inline">下一事件</span>
        <ChevronRight size={12} />
      </button>
    </div>
  )
}
