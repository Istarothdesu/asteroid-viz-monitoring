import Panel from '@/components/ui/Panel'
import { KV } from '@/components/common/atoms'
import { useSceneProductStore } from '@/core/sceneProducts/store'
import type { EventAnalysisContext } from '@/features/event-analysis/types'
import { LD_KM, type EventDetail } from '@/services/eventCenter'
import { fmtJDMinute, fmtKm } from '@/utils/orbital/time'

export default function EventTrajectoryPanel({
  event,
  analysis,
}: {
  event: EventDetail
  analysis: EventAnalysisContext
}) {
  const trajectory = useSceneProductStore((state) => state.products.trajectory)
  const result = trajectory?.contextId === analysis.contextId
    ? trajectory.payload
    : null

  if (!result) return null

  const cadDistanceKm = event.cad ? event.cad.distLd * LD_KM : null
  const differencePercent = result.closestKm != null && cadDistanceKm
    ? ((result.closestKm - cadDistanceKm) / cadDistanceKm) * 100
    : null

  return (
    <Panel title="名义轨道传播">
      <div className="flex flex-col gap-1.5 px-1 pb-1">
        <KV
          k="推演范围"
          v={result.spanDays != null
            ? `完整名义轨道 · ${result.spanDays.toFixed(1)} 天`
            : '完整名义轨道'}
        />
        <KV
          k="推演最近距离"
          v={result.closestKm != null
            ? `${fmtKm(result.closestKm)} (${(result.closestKm / LD_KM).toFixed(2)} LD)`
            : '—'}
          hl
        />
        <KV
          k="最近时刻"
          v={result.closestJd != null ? `${fmtJDMinute(result.closestJd)} TDB` : '—'}
        />
        {event.cad && (
          <>
            <KV
              k="CAD 官方值"
              v={`${fmtKm(cadDistanceKm!)} (${event.cad.distLd.toFixed(2)} LD)`}
            />
            <KV
              k="与官方偏差"
              v={result.orbitSolutionMatch === false
                ? '跨版本重算，不作精度对拍'
                : differencePercent != null
                  ? `${differencePercent >= 0 ? '+' : ''}${differencePercent.toFixed(2)}%`
                  : '—'}
            />
          </>
        )}
        <KV
          k="计算轨道解"
          v={`${result.orbitSolutionId ?? '未记录'}${
            !event.cad
              ? '（当前解）'
              : result.orbitSolutionMatch === false
                ? `（CAD ${event.cad.orbitId}）`
                : '（与 CAD 同版）'
          }`}
        />
        <KV
          k="初值来源"
          v={result.source === 'ephemeris' ? '全摄动星历' : '历元根数'}
        />
      </div>
    </Panel>
  )
}
