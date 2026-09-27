import { useNavigate } from 'react-router-dom'
import Panel from '@/components/ui/Panel'
import { ACTIVITY_LABEL } from '@/features/l1/observationPlan'
import { useObservationPlayback } from '@/features/l1/useObservationPlayback'
import { formatL1Time } from '@/features/l1/store'
import { getL1ActiveTask } from '@/services/l1MissionService'

/** 当前计划的时间态回放；与计划输入共同放在右栏，避免左右两处维护同一任务语义。 */
export default function CurrentPlanPlaybackPanel({ jd }: { jd: number }) {
  const navigate = useNavigate()
  const playback = useObservationPlayback(jd)
  const activity = playback?.activity
  const current = getL1ActiveTask(jd)
  const progress = current
    ? Math.min(1, Math.max(0, (jd - current.start) / (current.end - current.start)))
    : 0

  return (
    <Panel
      className="shrink-0"
      title="当前计划回放"
      extra={current ? (
        <span className="flex items-center gap-1 text-[9px] text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          计划时段内
        </span>
      ) : <span className="text-[9px] text-sky-400/70">无</span>}
    >
      {activity && (
        <div className="px-2.5 py-1 text-xs text-muted-foreground">
          {ACTIVITY_LABEL[activity.kind]} · {activity.name}<br />
          {playback?.check?.reason}
        </div>
      )}
      {current ? (
        <div className="px-2.5 pb-2">
          <button
            type="button"
            onClick={() => navigate(`/situation/l1/task/${current.id}`)}
            className="w-full text-left text-[12px] text-sky-100 transition-colors hover:text-sky-50"
            title="进入任务详情"
          >
            {current.name}
          </button>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-sky-400/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400/80 to-sky-300"
              style={{ width: `${Math.max(progress * 100, 2)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[9px] text-sky-400/70 tabular-nums">
            <span>{formatL1Time(current.start)} → {formatL1Time(current.end)}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
        </div>
      ) : (
        <div className="px-2.5 pb-2 text-[11px] text-sky-500/70">
          {activity ? '当前处于转向或等待时段，没有曝光访问占用' : '当前时刻未被输入计划覆盖'}
        </div>
      )}
    </Panel>
  )
}
