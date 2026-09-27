import Panel from '@/components/ui/Panel'
import { KV } from '@/components/common/atoms'
import type { EventAnalysisContext } from './types'
import { useRiskAnalysis } from './useRiskAnalysis'

const fmtIp = (value: number) =>
  value >= 0.01 ? `${(value * 100).toFixed(3)}%` : value.toExponential(3)

export default function ProbabilityRiskPanel({
  analysis,
  designation,
  encounterJd,
  requestedOrbitSolutionId,
  simulated = false,
}: {
  analysis: EventAnalysisContext
  designation: string
  encounterJd: number
  requestedOrbitSolutionId?: string | null
  simulated?: boolean
}) {
  const vm = useRiskAnalysis(
    analysis, designation, encounterJd, requestedOrbitSolutionId,
  )
  const { risk, bPlane, uncertaintyTube, encounterDensity } = vm

  return (
    <Panel title="风险概率分析" extra={<span className="text-[9px] text-sky-300/70">{simulated ? '模拟协方差' : 'SBDB · Sentry'}</span>}>
      <div className="flex flex-col gap-1.5 px-1 pb-1">
        {risk.sentry ? <>
          <div className="border-l-2 border-amber-300/70 pl-1.5 text-[10px] text-amber-200/85">官方口径：JPL Sentry 当前风险汇总</div>
          {risk.sentry.impactProbability != null && <KV k="官方撞击概率" v={fmtIp(risk.sentry.impactProbability)} hl />}
          <KV k="虚拟撞击体" v={`${risk.sentry.virtualImpactorCount ?? 0} 个`} />
          {risk.sentry.palermoCum != null && <KV k="Palermo 累积" v={risk.sentry.palermoCum.toFixed(2)} />}
          {risk.sentry.torinoMax != null && <KV k="Torino 最高" v={`${risk.sentry.torinoMax}`} />}
          {risk.sentry.impactRange && <KV k="风险时间范围" v={risk.sentry.impactRange} />}
        </> : (
          <div className="text-[10px] text-sky-400/75">{simulated ? '模拟事件：本地概率只用于可视化演示，不属于 Sentry 官方记录' : 'Sentry 当前无该目标风险条目'}</div>
        )}

        <div className="flex flex-col gap-1 border-t border-sky-400/15 pt-1.5">
          {risk.assessment ? <>
            <KV k="轨道解编号" v={risk.assessment.orbitSolutionId ?? '未提供'} />
            <KV k="协方差维度" v={`${risk.assessment.labels.length} × ${risk.assessment.labels.length}`} />
            <KV k="协方差历元" v={`JD ${risk.assessment.covarianceEpochTdb.toFixed(2)} TDB`} />
          </> : <div className="text-[10px] text-sky-400/75">SBDB 未提供协方差快照；不确定性管与概率密度已禁用</div>}
          <VersionStatus analysis={analysis} exact={risk.orbitSolutionMatch} />
          {risk.assessment && !risk.availability.uncertainty && (
            <div className="text-[9px] text-white/40">协方差缺少同历元六根数中心值；局部密度与不确定性管已禁用</div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 border-t border-sky-400/15 pt-1.5">
          <button type="button" onClick={() => void vm.calculateBPlane()} disabled={vm.bPlaneState === 'loading' || vm.estimateState === 'loading' || !risk.availability.bPlane} className="hud-btn cursor-pointer rounded-sm border border-sky-400/35 px-2 py-1 text-[10px] text-sky-200 hover:border-sky-300/70 disabled:opacity-50">
            {vm.bPlaneState === 'loading' ? '正在计算名义 B 平面…' : '计算并在三维场景显示 B 平面'}
          </button>
          {vm.bPlaneState === 'error' && <div className="text-[10px] text-orange-300/80">{vm.bPlaneError ?? 'B 平面计算失败：需要目标轨道与行星星历'}</div>}
          {bPlane && <>
            <KV k="B 向量模长" v={`${Math.round(bPlane.bMagnitudeKm).toLocaleString()} km`} hl />
            <KV k="ξ / ζ" v={`${Math.round(bPlane.xiKm).toLocaleString()} / ${Math.round(bPlane.zetaKm).toLocaleString()} km`} />
            <KV k="入射 v∞" v={`${bPlane.vinfKms.toFixed(3)} km/s`} />
            <KV k="引力聚焦半径" v={`${Math.round(bPlane.effectiveImpactRadiusKm).toLocaleString()} km`} />
            <KV k="计算轨道解" v={`${bPlane.orbitSolutionId ?? '未记录'}${bPlane.orbitSolutionMatch ? '（与CAD同版）' : '（现有快照重算）'}`} />
          </>}
          {risk.availability.uncertainty && (
            <button type="button" onClick={() => void vm.calculateUncertainty()} disabled={vm.estimateState === 'loading' || vm.bPlaneState === 'loading'} className="hud-btn cursor-pointer rounded-sm border border-violet-400/35 px-2 py-1 text-[10px] text-violet-200 hover:border-violet-300/70 disabled:opacity-50">
              {vm.estimateState === 'loading' ? '正在传播协方差 sigma 状态…' : '重新评估局部 B 平面协方差'}
            </button>
          )}
          {vm.estimateState === 'error' && <div className="text-[10px] text-orange-300/80">{vm.estimateError ?? '局部估计不可用：需标准六根数协方差，且协方差历元距遭遇不超过 10 年'}</div>}
          {encounterDensity && <>
            <KV k="局部积分命中" v={`${encounterDensity.hitCount} / ${encounterDensity.sampleCount}`} />
            <KV k="局部线性概率" v={fmtIp(encounterDensity.localImpactProbability)} hl />
            <KV k="场景名义轨迹" v="SBDB 协方差传播中心线" />
            {uncertaintyTube && <KV k="不确定性管" v={`${uncertaintyTube.confidenceSigma}σ · ${uncertaintyTube.sections.length} 个截面`} />}
            <KV k="B 平面密度廊道" v="二维高斯热图 · 1σ / 3σ 等密度线" />
            <div className="text-[9px] text-violet-200/70">局部近似不替代 Sentry 官方 VI/IP。</div>
          </>}
        </div>
      </div>
    </Panel>
  )
}

function VersionStatus({ analysis, exact }: { analysis: EventAnalysisContext; exact: boolean }) {
  if (!analysis.requestedOrbitSolutionId) return null
  if (exact) {
    return <div className="text-[9px] text-emerald-300/75">CAD、名义轨道与协方差均使用解 {analysis.requestedOrbitSolutionId}</div>
  }
  return (
    <div className="text-[10px] text-orange-300/85">
      CAD 解 {analysis.requestedOrbitSolutionId}；当前轨道解 {analysis.orbit?.meta.dataVersion ?? '缺失'}；协方差解 {analysis.covariance?.meta.dataVersion ?? '缺失'}。可按现有快照重算，但不作同版精度对拍。
    </div>
  )
}
