import Panel from '@/components/ui/Panel'
import { Chip, KV } from '@/components/common/atoms'
import type { SimEventFormData } from './types'
import {
  canPreviewSimEvent,
  formatOptionalNumber,
  resolveImpactPhysics,
} from './model'

export default function SimEventPreviewPanels({ data }: { data: SimEventFormData }) {
  const physics = resolveImpactPhysics(data)
  const previewReady = canPreviewSimEvent(data)
  const isImpact = data.type === 'impact'

  return (
    <>
      <Panel
        title="参数预览"
        extra={<Chip ok={previewReady}>{previewReady ? '可绘制' : '参数不足'}</Chip>}
      >
        <div className="px-1 pb-1">
          <KV k="事件类型" v={isImpact ? '撞击' : '飞掠'} hl />
          <KV k="目标类型" v={data.targetType} />
          <KV k="目标直径" v={formatOptionalNumber(data.diam, 1, ' m')} />
          <KV
            k="遭遇时间"
            v={data.dateUTC ? `${data.dateUTC.replace('T', ' ')} UTC` : '—'}
          />
          <KV k="提前显示" v={formatOptionalNumber(data.leadH, 0, ' h')} />
        </div>
      </Panel>

      <Panel title="轨道根数">
        <div className="px-1 pb-1">
          <KV k="半长轴 a" v={`${formatOptionalNumber(data.el.a, 3)} AU`} />
          <KV k="偏心率 e" v={formatOptionalNumber(data.el.e, 3)} />
          <KV k="倾角 i" v={formatOptionalNumber(data.el.i, 1, '°')} />
          <KV k="升交点经度 Ω" v={formatOptionalNumber(data.el.O, 1, '°')} />
          <KV k="近日点幅角 ω" v={formatOptionalNumber(data.el.w, 1, '°')} />
        </div>
      </Panel>

      <Panel title={isImpact ? '撞击参数' : '飞掠参数'}>
        <div className="px-1 pb-1">
          {isImpact ? (
            <>
              <KV
                k="坠落地点"
                v={`${formatOptionalNumber(data.impactLat ?? 30, 1, '°')} / ${formatOptionalNumber(data.impactLon ?? 110, 1, '°')}`}
              />
              <KV k="爆炸高度" v={formatOptionalNumber(physics.burstAltKm, 1, ' km')} />
              <KV k="爆炸能量" v={formatOptionalNumber(physics.energyMt, 3, ' Mt')} hl />
              <KV
                k="冲击波范围"
                v={`${Math.round(physics.shockAreaKm2 ?? 0).toLocaleString()} km²`}
              />
            </>
          ) : (
            <KV
              k="最近接近距离"
              v={`${Math.round(data.missKm ?? 0).toLocaleString()} km`}
              hl
            />
          )}
        </div>
      </Panel>
    </>
  )
}
