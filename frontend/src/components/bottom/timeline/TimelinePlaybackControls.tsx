import { Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PAUSE_SPEED_INDEX, SPEED_OPTIONS } from '@/store/simStore'
import { RATE_TICKS } from './model'
import PlaybackToggle from './PlaybackToggle'

interface TimelinePlaybackControlsProps {
  playing: boolean
  playRate: number
  rateIndex: number
  currentTimeText: string
  onToday: () => void
  onTogglePlaying: () => void
  onRateChange: (rate: number) => void
}

export default function TimelinePlaybackControls({
  playing,
  playRate,
  rateIndex,
  currentTimeText,
  onToday,
  onTogglePlaying,
  onRateChange,
}: TimelinePlaybackControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="hud"
        size="sm"
        className="h-8 shrink-0 gap-1.5 px-2 text-[10px] text-emerald-300"
        title="跳转到当前真实时刻"
        onClick={onToday}
      >
        <Radio size={12} />
        <span className="hidden xl:inline">回到现在</span>
      </Button>

      <PlaybackToggle playing={playing} onToggle={onTogglePlaying} />

      <div className="min-w-[240px] flex-1">
        <div className="flex items-center gap-2">
          <span className={`w-[82px] shrink-0 text-center text-[10px] tabular-nums ${playing ? 'text-orange-300' : 'text-sky-300'}`}>
            {playRate === 0
              ? '暂停 0'
              : playing ? SPEED_OPTIONS[rateIndex].label : `已暂停 · ${SPEED_OPTIONS[rateIndex].label}`}
          </span>
          <input
            type="range"
            min={0}
            max={SPEED_OPTIONS.length - 1}
            step={1}
            value={rateIndex}
            aria-label="正反向仿真速率"
            onChange={(event) => onRateChange(SPEED_OPTIONS[+event.target.value].multiplier)}
            className="time-rate-slider w-full"
          />
        </div>
        <div className="pointer-events-none relative ml-[90px] mt-0.5 hidden h-3 text-[8px] text-sky-400/65 tabular-nums 2xl:block">
          {RATE_TICKS.map((index) => (
            <span
              key={index}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${(index / (SPEED_OPTIONS.length - 1)) * 100}%` }}
            >
              {index === PAUSE_SPEED_INDEX ? '0' : SPEED_OPTIONS[index].label.replace(' 实时', '')}
            </span>
          ))}
        </div>
      </div>

      <output
        aria-label="当前 UTC 时刻"
        className="min-w-[176px] shrink-0 text-right text-[10px] text-sky-100 tabular-nums"
      >
        {currentTimeText}
      </output>
    </div>
  )
}
