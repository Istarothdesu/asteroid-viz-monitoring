import { History, TriangleAlert } from 'lucide-react'
import { Vector3 } from 'three'
import { SevenSeg } from '@/components/ui/SevenSeg'
import { useSceneProductStore } from '@/core/sceneProducts/store'
import { PLANETS } from '@/data/planets'
import { useLiveJd } from '@/hooks/useLiveJd'
import { SEVERITY_META, SOURCE_META, LD_KM, fmtEventDate, type EventDetail } from '@/services/eventCenter'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { AU_KM } from '@/utils/orbital/constants'
import { astPos } from '@/utils/orbital/asteroids'
import { planetPos } from '@/utils/orbital/planets'
import { formatDiameter } from './formatters'

function interpolateRiskTrajectory(
  points: { jd: number; centerEclipticAu: [number, number, number] }[],
  jd: number,
  out: Vector3,
): boolean {
  if (points.length < 2 || jd < points[0].jd || jd > points[points.length - 1].jd) return false
  let low = 0
  let high = points.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (points[middle].jd <= jd) low = middle
    else high = middle
  }
  const from = points[low]
  const to = points[high]
  const ratio = (jd - from.jd) / Math.max(1e-12, to.jd - from.jd)
  out.set(
    from.centerEclipticAu[0] + (to.centerEclipticAu[0] - from.centerEclipticAu[0]) * ratio,
    from.centerEclipticAu[1] + (to.centerEclipticAu[1] - from.centerEclipticAu[1]) * ratio,
    from.centerEclipticAu[2] + (to.centerEclipticAu[2] - from.centerEclipticAu[2]) * ratio,
  )
  return true
}

/** 事件专题顶部倒计时，只订阅展示所需的时钟与轨迹。 */
export default function EventCountdownBanner({ event }: { event: EventDetail }) {
  const jd = useLiveJd(250)
  const future = event.jdEnc >= jd
  const differenceDays = Math.abs(event.jdEnc - jd)
  const dayPart = Math.floor(differenceDays)
  const seconds = Math.round((differenceDays - dayPart) * 86400)
  const hourPart = Math.floor(seconds / 3600)
  const minutePart = Math.floor((seconds % 3600) / 60)
  const secondPart = seconds % 60
  const clockText = dayPart > 0
    ? `${dayPart}d ${String(hourPart).padStart(2, '0')}:${String(minutePart).padStart(2, '0')}:${String(secondPart).padStart(2, '0')}`
    : `${String(hourPart).padStart(2, '0')}:${String(minutePart).padStart(2, '0')}:${String(secondPart).padStart(2, '0')}`

  const severity = SEVERITY_META[event.severity]
  const isImpact = event.type === 'impact'
  const missDistance = event.missKm == null
    ? null
    : event.missKm < LD_KM
      ? `${Math.round(event.missKm).toLocaleString()} km`
      : `${(event.missKm / LD_KM).toFixed(2)} LD`
  const previewElements = useEventSimulationStore((state) => state.previewEl)
  const riskTrajectory = useSceneProductStore(
    (state) => state.products.uncertaintyTube?.payload.nominalTrajectory ?? null,
  )

  let earthDistanceKm: string | null = null
  if (riskTrajectory || previewElements) {
    const asteroid = new Vector3()
    const earth = new Vector3()
    try {
      const interpolated = riskTrajectory
        ? interpolateRiskTrajectory(riskTrajectory.points, jd, asteroid)
        : false
      if (!interpolated && previewElements) astPos(previewElements, jd, asteroid)
      planetPos(PLANETS[2], jd, earth)
      earthDistanceKm = (asteroid.distanceTo(earth) * AU_KM).toLocaleString('en-US', {
        maximumFractionDigits: 0,
      })
    } catch {
      earthDistanceKm = null
    }
  }

  return (
    <div
      className="pointer-events-auto flex min-w-fit animate-float-in items-stretch gap-5 rounded-lg border px-6 py-3"
      style={{
        background: future
          ? 'linear-gradient(135deg, rgba(120,40,60,0.95) 0%, rgba(60,20,35,0.93) 100%)'
          : 'linear-gradient(135deg, rgba(35,55,85,0.95) 0%, rgba(20,35,60,0.93) 100%)',
        borderColor: future ? 'rgba(220,80,100,0.6)' : 'rgba(100,150,200,0.5)',
        boxShadow: future
          ? '0 0 28px rgba(220,80,100,0.35), inset 0 1px 2px rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.4)'
          : '0 0 24px rgba(100,150,200,0.28), inset 0 1px 2px rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-bold"
            style={{ color: severity.color, borderLeft: `3px solid ${severity.color}`, background: `${severity.color}18` }}
          >
            {severity.label}
          </span>
          <span className={`rounded border-l-2 px-2 py-0.5 text-[11px] font-semibold ${isImpact ? 'border-red-400 bg-red-500/20 text-red-100' : 'border-sky-400 bg-sky-500/15 text-sky-100'}`}>
            {isImpact ? '撞击事件' : '飞掠'}
          </span>
          <span className="border-l border-white/30 pl-2 text-[10px] text-white/60">
            {SOURCE_META[event.source].label}
          </span>
        </div>
        <div className="truncate text-sm font-semibold leading-tight text-white">{event.target}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-white/70">
          <Metric symbol="∅">{`${event.diamEstimated ? '~' : ''}${formatDiameter(event.diam)}`}</Metric>
          {isImpact && event.energyMt != null && (
            <Metric symbol="E">{event.energyMt >= 1 ? `${event.energyMt.toFixed(1)}Mt` : `${(event.energyMt * 1000).toFixed(0)}kt`}</Metric>
          )}
          {!isImpact && missDistance && <Metric symbol="min">{missDistance}</Metric>}
          {event.vRelKms != null && <Metric symbol="v">{event.vRelKms.toFixed(2)}km/s</Metric>}
        </div>
      </div>

      <div
        className="w-px self-stretch"
        style={{ background: future
          ? 'linear-gradient(180deg, transparent, rgba(200,80,100,0.4), transparent)'
          : 'linear-gradient(180deg, transparent, rgba(100,150,200,0.3), transparent)' }}
      />

      <div className="flex min-w-[160px] flex-col items-center justify-center text-center">
        <div className="mb-2 flex items-center justify-center gap-1.5">
          {future
            ? <TriangleAlert size={14} className="shrink-0 animate-pulse-glow text-red-300" />
            : <History size={14} className="shrink-0 text-sky-300/80" />}
          <span className="text-[11px] font-bold tracking-wide" style={{ color: future ? 'rgba(255,180,190,1)' : 'rgba(180,220,255,0.95)' }}>
            {future ? '风险窗口' : '已关闭'}
          </span>
        </div>
        <div className="mb-1">
          <SevenSeg
            value={clockText}
            size={dayPart > 0 ? 24 : 28}
            ghost
            blinkColon={future}
            className={future ? 'text-red-200 seg-red-glow' : 'text-sky-200'}
          />
        </div>
        {earthDistanceKm && (
          <div className="mb-1 text-[9px] font-semibold text-[rgba(200,150,255,0.8)]">
            地心 {earthDistanceKm} km
          </div>
        )}
        <div className="text-[8.5px] leading-snug tabular-nums" style={{ color: future ? 'rgba(255,200,210,0.8)' : 'rgba(170,210,250,0.75)' }}>
          {fmtEventDate(event.dateUTC, event.source === 'cad' ? 'TDB' : 'UTC')}
        </div>
      </div>
    </div>
  )
}

function Metric({ symbol, children }: { symbol: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-white/50">{symbol}</span>
      <span>{children}</span>
    </div>
  )
}
