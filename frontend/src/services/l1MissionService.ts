/** 旧任务页面适配器：摘要由观测计划派生，不再自行生成扫描/候选执行任务。 */
import { getL1MissionProvider } from '@/features/l1/missionProvider'
import type { PreparedPlan } from '@/features/l1/observationPlan'

export type L1TaskType = 'survey' | 'characterization' | 'calibration'
export type L1TaskStatus = 'completed' | 'executing' | 'planned'
export interface L1Task {
  kind: 'simulation-plan' | 'external-plan'
  id: string; name: string; type: L1TaskType; start: number; end: number
  params: [string, string][]; purpose: string; targetName?: string; targetIdx?: number
}
export function taskStatus(t: L1Task, jd: number): L1TaskStatus {
  return jd < t.start ? 'planned' : jd >= t.end ? 'completed' : 'executing'
}
let cached: PreparedPlan | null = null, tasks: L1Task[] = []
export function getL1Tasks(jd: number): L1Task[] {
  const prepared = getL1MissionProvider().getObservationPlan(jd)
  if (prepared === cached) return tasks
  cached = prepared; tasks = []
  if (!prepared) return tasks
  const { plan, exposures } = prepared
  const groups = new Map<string, typeof plan.activities>()
  for (const a of plan.activities) {
    const id = a.visitId ?? (a.kind === 'calibration' || a.kind === 'exposure' ? a.id : null)
    if (!id) continue
    const group = groups.get(id) ?? []; group.push(a); groups.set(id, group)
  }
  for (const [id, activities] of groups) {
    const first = activities[0], last = activities.at(-1)!, exp = exposures.filter(e => (e.activity.visitId ?? e.activity.id) === id)
    const calibration = first.kind === 'calibration'
    tasks.push({ kind: plan.source === 'simulation' ? 'simulation-plan' : 'external-plan',
      id, name: calibration ? first.name : first.targetId ? `目标跟踪 · ${first.targetName}` : first.fieldId ? `天区 ${first.fieldId} · 第 ${first.revisit} 次访问` : first.name,
      type: calibration ? 'calibration' : first.targetId ? 'characterization' : 'survey',
      start: first.start, end: last.end, targetName: first.targetName,
      params: [['计划版本', `${plan.id} / v${plan.version}`], ['数据性质', plan.source === 'simulation' ? '模拟计划回放' : '外部计划回放（非执行反馈）'],
        ['视场', `${plan.instrument.fovWidthDeg}° × ${plan.instrument.fovHeightDeg}°`],
        ['曝光数量', `${exp.length}（几何通过 ${exp.filter(e => e.check.valid).length}）`],
        ['约束检查', '保守视场包络 / 5 秒采样'], ['坐标 / 时标', `${plan.frame} / ${plan.timeScale}`]],
      purpose: '展示输入计划的转向、稳定与曝光时序；有效仿真曝光生成足迹，不代表真实执行或探测发现' })
  }
  return tasks
}
export function getL1ActiveTask(jd: number): L1Task | null {
  return getL1Tasks(jd).find(t => taskStatus(t, jd) === 'executing') ?? null
}
export function isL1Calibrating(jd: number): boolean {
  return getL1MissionProvider().getObservationPlayback(jd)?.activity?.kind === 'calibration'
}
export function findL1Task(list: L1Task[], id: string) { return list.find(t => t.id === id) }
