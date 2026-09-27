import { SevenSeg } from '@/components/ui/SevenSeg'
import { jdToDate } from '@/utils/orbital/time'

const pad = (n: number) => String(n).padStart(2, '0')

/** 电子钟展示层；主时间轴与事件仿真都传入同一场景 JD。 */
export default function DigitalTimeDisplay({ jd, label = '仿真时间', dateText, timeText }: {
  jd: number
  label?: string
  dateText?: string
  timeText?: string
}) {
  const date = jdToDate(jd)
  const dateValue = dateText ?? `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  const timeValue = timeText ?? `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  return <div
    role="timer"
    aria-label={`${label} ${dateValue} ${timeValue} UTC`}
    className="pointer-events-none flex items-center gap-3 rounded-sm border border-sky-400/25 bg-[rgba(6,15,32,0.72)] px-5 py-2 shadow-[0_0_18px_rgba(56,189,248,0.15)] backdrop-blur-[2px]"
  >
    <SevenSeg value={dateValue} size={24} ghost />
    <SevenSeg value={timeValue} size={24} ghost blinkColon />
    <span className="rounded-sm border border-sky-400/30 px-1.5 py-px text-[10px] tracking-wider text-sky-300/80">UTC</span>
  </div>
}
