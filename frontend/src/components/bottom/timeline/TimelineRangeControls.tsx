import { TIME_SCALE_OPTIONS } from './model'

interface TimelineRangeControlsProps {
  scaleDays: number
  startText: string
  endText: string
  onScaleChange: (days: number) => void
  onStartTextChange: (value: string) => void
  onEndTextChange: (value: string) => void
  onCommitBoundary: (kind: 'start' | 'end', value: string) => void
}

export default function TimelineRangeControls({
  scaleDays,
  startText,
  endText,
  onScaleChange,
  onStartTextChange,
  onEndTextChange,
  onCommitBoundary,
}: TimelineRangeControlsProps) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span className="mr-1 shrink-0 text-[9px] text-sky-500/70">时间尺度</span>
        {TIME_SCALE_OPTIONS.map((preset) => {
          const active = Math.abs(scaleDays - preset.days) < 1e-8
          return (
            <button
              type="button"
              key={preset.label}
              onClick={() => onScaleChange(preset.days)}
              className={`h-6 min-w-10 rounded-sm border px-1.5 text-[9px] transition-colors ${
                active
                  ? 'border-sky-300/70 bg-sky-400/20 text-sky-100'
                  : 'border-sky-400/20 bg-sky-950/35 text-sky-400 hover:border-sky-300/55'
              }`}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

      <RangeInput
        label="开始 UTC"
        ariaLabel="仿真开始时间 UTC"
        value={startText}
        onChange={onStartTextChange}
        onCommit={(value) => onCommitBoundary('start', value)}
      />
      <RangeInput
        label="结束 UTC"
        ariaLabel="仿真结束时间 UTC"
        value={endText}
        onChange={onEndTextChange}
        onCommit={(value) => onCommitBoundary('end', value)}
      />
    </div>
  )
}

function RangeInput({
  label,
  ariaLabel,
  value,
  onChange,
  onCommit,
}: {
  label: string
  ariaLabel: string
  value: string
  onChange: (value: string) => void
  onCommit: (value: string) => void
}) {
  return (
    <label className="flex shrink-0 items-center gap-1 text-[9px] text-sky-500/75">
      <span>{label}</span>
      <input
        type="datetime-local"
        step={1}
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onCommit(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
        className="h-7 w-[158px] rounded-sm border border-sky-400/25 bg-[rgba(8,20,42,0.8)] px-1.5 text-[9px] text-sky-100 tabular-nums outline-none [color-scheme:dark] focus:border-sky-300/70"
      />
    </label>
  )
}
