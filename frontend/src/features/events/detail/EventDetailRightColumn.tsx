import { useMemo } from 'react'
import ProbabilityRiskPanel from '@/features/event-analysis/ProbabilityRiskPanel'
import type { EventAnalysisContext } from '@/features/event-analysis/types'
import { useSimStore } from '@/store/simStore'
import type { EventRecord } from '@/types/scene'
import type { EventDetail } from '@/services/eventCenter'
import { buildEventRiskConclusion } from './eventRiskConclusion'
import RiskConclusionPanel from './RiskConclusionPanel'
import RiskTargetPanel, { type EventOrbitView } from './RiskTargetPanel'

export default function EventDetailRightColumn({
  event,
  orbit,
  orbitState,
  cadRecord,
  analysis,
}: {
  event: EventDetail
  orbit: EventOrbitView | null
  orbitState: 'idle' | 'loading' | 'ok' | 'err'
  cadRecord: EventRecord | null
  analysis: EventAnalysisContext
}) {
  const record = event.record ?? cadRecord
  const riskDesignation = event.cad?.des ?? record?.el.des
  // 分析结论只需进入详情时的参考时刻；订阅逐帧仿真时钟会让整列风险组件持续重渲染。
  const referenceJd = useSimStore.getState().jd
  const conclusion = useMemo(
    () => buildEventRiskConclusion(event, record, referenceJd),
    [event, record, referenceJd],
  )

  return (
    <>
      <RiskTargetPanel
        event={event}
        orbit={orbit}
        orbitState={orbitState}
        record={record}
      />
      {riskDesignation && (
        <ProbabilityRiskPanel
          designation={riskDesignation}
          encounterJd={event.jdEnc}
          requestedOrbitSolutionId={event.cad?.orbitId}
          analysis={analysis}
          simulated={event.source === 'sim'}
        />
      )}
      <RiskConclusionPanel event={event} conclusion={conclusion} />
    </>
  )
}
