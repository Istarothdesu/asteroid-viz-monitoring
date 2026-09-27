import Panel from '@/components/ui/Panel'
import { KV } from '@/components/common/atoms'
import type { EventRecord } from '@/types/scene'
import {
  CATEGORY_META,
  SOURCE_META,
  type EventDetail,
} from '@/services/eventCenter'
import { periAph } from '@/utils/orbital/encounter'
import { formatDiameter } from './formatters'

export interface EventOrbitView {
  a: number
  e: number
  i: number
  O: number
  w: number
}

export default function RiskTargetPanel({
  event,
  orbit,
  orbitState,
  record,
}: {
  event: EventDetail
  orbit: EventOrbitView | null
  orbitState: 'idle' | 'loading' | 'ok' | 'err'
  record: EventRecord | null
}) {
  const source = SOURCE_META[event.source]
  const elements = record?.el ?? orbit
  const apsides = elements ? periAph(elements.a, elements.e) : null
  const massKg = 3000 * (Math.PI / 6) * (event.diam * 1000) ** 3
  const massExponent = Math.floor(Math.log10(massKg))

  return (
    <Panel
      title="风险目标"
      extra={(
        <span className={`rounded-sm border px-1.5 py-px text-[9px] ${source.cls}`}>
          {source.label}
        </span>
      )}
    >
      <div className="flex flex-col gap-1.5 px-1 pb-1">
        <div className="flex items-center gap-2">
          <span className="hud-title text-[14px] text-sky-50">{event.target}</span>
          <span
            className={`rounded-sm border px-1 py-px text-[9px] ${
              event.type === 'impact'
                ? 'border-red-400/35 bg-red-400/10 text-red-300'
                : 'border-sky-400/30 bg-sky-400/[0.06] text-sky-300'
            }`}
          >
            {event.type === 'impact' ? '撞击体' : '近地天体'}
          </span>
          <span className="rounded-sm border border-sky-400/20 bg-sky-400/[0.05] px-1 py-px text-[9px] text-sky-400/80">
            {CATEGORY_META[event.category].label}事件
          </span>
        </div>
        <KV
          k="直径"
          v={(
            <>
              {formatDiameter(event.diam)}
              {event.diamEstimated && <span className="text-sky-500/70"> (估算)</span>}
            </>
          )}
          hl
        />
        <KV
          k="估算质量"
          v={(
            <>
              {(massKg / 10 ** massExponent).toFixed(2)} × 10
              <sup>{massExponent}</sup> kg
            </>
          )}
        />
        <KV k="假设密度" v="3000 kg/m³ (石质)" />

        <div className="flex flex-col gap-1.5 border-t border-sky-400/15 pt-1.5">
          {orbitState === 'loading' && (
            <div className="animate-pulse text-[10px] text-sky-400/70">
              正在查询 SBDB 轨道数据…
            </div>
          )}
          {orbitState === 'err' && (
            <div className="text-[10px] text-orange-300/80">
              轨道数据查询失败, 仅展示接近几何参数
            </div>
          )}
          {apsides ? (
            <>
              <KV k="轨道半长轴" v={`${elements!.a.toFixed(4)} AU`} />
              <KV k="轨道偏心率" v={elements!.e.toFixed(4)} />
              <KV k="轨道倾角" v={`${elements!.i.toFixed(2)}°`} />
              <KV k="近日点距离" v={`${apsides.q.toFixed(4)} AU`} hl />
              <KV k="远日点距离" v={`${apsides.Q.toFixed(3)} AU`} />
              <KV k="公转周期" v={`${Math.sqrt(elements!.a ** 3).toFixed(2)} 年`} />
            </>
          ) : orbitState !== 'loading' && orbitState !== 'err' ? (
            <div className="text-[10px] text-sky-500/70">
              内置事件轨道为仿真拟合专用, 不展示静态根数
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  )
}
