import Panel from '@/components/ui/Panel'
import { KV } from '@/components/common/atoms'
import type { EventRecord } from '@/types/scene'
import {
  LD_KM,
  SEVERITY_META,
  SOURCE_META,
  fmtEventDate,
  type EventDetail,
} from '@/services/eventCenter'
import { fmtJDMinute, fmtKm } from '@/utils/orbital/time'
import { formatDiameter, formatEnergy } from './formatters'

interface EventSummaryProps {
  event: EventDetail
  record: EventRecord | null
}

export function EventInfoPanel({ event, record }: EventSummaryProps) {
  const severity = SEVERITY_META[event.severity]
  const source = SOURCE_META[event.source]
  const discoveryJd = event.jdEnc - event.leadH / 24

  return (
    <Panel
      title="事件信息"
      extra={(
        <span
          className="rounded-sm border px-1.5 text-[10px] tabular-nums"
          style={{
            color: severity.color,
            borderColor: `${severity.color}66`,
            background: `${severity.color}1a`,
          }}
        >
          {severity.label}
        </span>
      )}
    >
      <div className="flex flex-col gap-1.5 px-1 pb-1">
        {record?.img && (
          <div className="overflow-hidden rounded-sm border border-sky-400/20">
            <img
              src={record.img}
              alt={event.name}
              className="h-[120px] w-full object-cover"
            />
          </div>
        )}
        {record?.credit && (
          <div className="text-[9px] text-sky-500/70">{record.credit}</div>
        )}
        <div className="text-[12px] leading-snug text-sky-100">{event.name}</div>
        <KV
          k="事件类型"
          v={event.type === 'impact' ? '撞击事件' : '近距离飞掠'}
          hl
        />
        <KV
          k="遭遇时刻"
          v={fmtEventDate(event.dateUTC, event.source === 'cad' ? 'TDB' : 'UTC')}
          hl
        />
        <KV
          k="发现时刻"
          v={`${fmtJDMinute(discoveryJd)} (提前 ${event.leadH} 小时)`}
        />
        <KV
          k="天体直径"
          v={(
            <>
              {formatDiameter(event.diam)}
              {event.diamEstimated && (
                <span className="text-sky-500/70"> (H 星等估算)</span>
              )}
            </>
          )}
        />
        <KV k="数据来源" v={source.label} />
        {record?.impactLat != null && (
          <KV
            k="坠落地点"
            v={`${record.impactLat.toFixed(1)}°, ${record.impactLon?.toFixed(1)}°`}
          />
        )}
      </div>
    </Panel>
  )
}

export function EventTimelinePanel({ event }: { event: EventDetail }) {
  const severity = SEVERITY_META[event.severity]
  const discoveryJd = event.jdEnc - event.leadH / 24

  return (
    <Panel title="事件时间线">
      <div className="px-2 py-2">
        <div className="flex items-center">
          <div className="flex w-[104px] flex-col items-center gap-1">
            <span className="size-2 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />
            <span className="text-[10px] text-sky-300/90">发现目标</span>
            <span className="text-[9px] tabular-nums text-sky-500/80">
              {fmtJDMinute(discoveryJd)}
            </span>
          </div>
          <div
            className="-mt-6 h-px flex-1"
            style={{
              background: `linear-gradient(90deg, rgba(56,189,248,0.5), ${severity.color})`,
            }}
          />
          <div className="flex w-[104px] flex-col items-center gap-1">
            <span
              className="size-2.5 animate-pulse-glow rounded-full"
              style={{
                background: severity.color,
                boxShadow: `0 0 8px ${severity.color}`,
              }}
            />
            <span className="text-[10px]" style={{ color: severity.color }}>
              {event.type === 'impact' ? '撞击发生' : '最近接近'}
            </span>
            <span className="text-[9px] tabular-nums text-sky-500/80">
              {fmtJDMinute(event.jdEnc)}
            </span>
          </div>
        </div>
      </div>
    </Panel>
  )
}

export function EventRiskParametersPanel({ event, record }: EventSummaryProps) {
  const severity = SEVERITY_META[event.severity]

  return (
    <Panel title="风险参数">
      <div className="flex flex-col gap-1.5 px-1 pb-1">
        {event.type === 'flyby' ? (
          <>
            <KV
              k="最近接近距离"
              v={`${fmtKm(event.missKm ?? 0)} (${((event.missKm ?? 0) / LD_KM).toFixed(2)} LD)`}
              hl
            />
            <KV
              k="相对速度"
              v={event.vRelKms ? `${event.vRelKms.toFixed(1)} km/s` : '待轨道确定'}
            />
            <KV k="天体直径" v={formatDiameter(event.diam)} />
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-sky-400/70">撞击能量当量</span>
              <span
                className="text-[14px] tabular-nums glow-text"
                style={{ color: severity.color }}
              >
                {formatEnergy(event.energyMt ?? 0)} TNT
              </span>
            </div>
            {[
              { label: '广岛原子弹', ref: 0.015 },
              { label: '通古斯事件', ref: 12 },
            ].map(({ label, ref }) => {
              const ratio = Math.min((event.energyMt ?? 0) / ref, 3) / 3
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="w-14 shrink-0 text-[9px] text-sky-500/70">{label}</span>
                  <div className="h-[4px] flex-1 overflow-hidden rounded-full bg-sky-400/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500/80 to-red-400"
                      style={{ width: `${Math.max(ratio * 100, 3)}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right text-[9px] tabular-nums text-sky-300/80">
                    ×{((event.energyMt ?? 0) / ref).toExponential(1)}
                  </span>
                </div>
              )
            })}
            <KV
              k="爆炸高度"
              v={record?.burstAltKm ? `${record.burstAltKm} km (空爆)` : '地表'}
            />
            {record?.shockAreaKm2 != null && (
              <KV
                k="冲击波范围"
                v={`${Math.round(record.shockAreaKm2).toLocaleString()} km²`}
              />
            )}
          </>
        )}
      </div>
    </Panel>
  )
}

export function EventDescriptionPanel({ record }: { record: EventRecord | null }) {
  if (!record) return null

  return (
    <Panel title="事件描述">
      <div className="flex flex-col gap-1.5 px-1 pb-1">
        <div className="text-[10px] leading-relaxed text-sky-200/90">
          {record.desc}
        </div>
        {record.news && (
          <div className="rounded-sm border border-sky-400/15 bg-sky-400/[0.06] p-2 text-[10px] leading-relaxed text-sky-400/90">
            {record.news}
          </div>
        )}
      </div>
    </Panel>
  )
}
