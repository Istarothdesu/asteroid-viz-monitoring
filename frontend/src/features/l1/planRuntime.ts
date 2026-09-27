/** 数据入口与回放入口。未来外部系统只需提供 ObservationPlan，不进入渲染层制定策略。 */
import { create } from 'zustand'
import { useDataStore } from '@/store/dataStore'
import { ephemEpoch, ephemPos } from '@/utils/orbital/ephemeris'
import { getL1ObserverState, getL1Reference, vector } from './runtime'
import { generateSurveyPlan, generateTrackingPlan } from './mockPlans'
import { evaluatePlan, preparePlan, validatePlan } from './observationPlan'
import type { ObservationPlan, PlanEnvironment, PreparedPlan } from './observationPlan'

interface PlanState {
  scenario: 'survey' | 'tracking'; externalPlan: ObservationPlan | null
  showPlanned: boolean; showExposed: boolean
  setScenario: (scenario: 'survey' | 'tracking') => void
  importPlan: (plan: ObservationPlan) => void
  togglePlanned: () => void; toggleExposed: () => void
}
export const useObservationPlanStore = create<PlanState>((set, get) => ({
  scenario: 'survey', externalPlan: null, showPlanned: true, showExposed: true,
  setScenario: scenario => set({ scenario, externalPlan: null }),
  importPlan: plan => {
    validatePlan(plan)
    // 导入的是计划，不是实际执行反馈；保留原始计划，不擅自修正不满足几何约束的活动。
    const copy = structuredClone(plan)
    copy.source = 'external-plan'
    set({ externalPlan: copy })
  },
  togglePlanned: () => set({ showPlanned: !get().showPlanned }),
  toggleExposed: () => set({ showExposed: !get().showExposed }),
}))

const environment: PlanEnvironment = { observer: getL1ObserverState,
  targetPosition: (id, jd) => { const p = vector(); return ephemPos(id, jd, p) ? p : null } }
let cacheKey = '', cached: PreparedPlan | null = null, cachedError = ''
let cacheReference = getL1Reference(), cacheAsteroids = useDataStore.getState().asteroids
let cacheExternal: ObservationPlan | null = null

export function getObservationPlan(jd: number): PreparedPlan | null {
  const reference = getL1Reference(), asteroids = useDataStore.getState().asteroids
  const { scenario, externalPlan } = useObservationPlanStore.getState()
  const day = Math.floor(jd-.5)+.5, key = `${scenario}-${externalPlan ? 'external' : day}-${ephemEpoch()}`
  if (key === cacheKey && reference === cacheReference && asteroids === cacheAsteroids && externalPlan === cacheExternal) return cached
  cacheKey = key; cacheReference = reference; cacheAsteroids = asteroids; cacheExternal = externalPlan
  cached = null; cachedError = ''
  if (!reference) { cachedError = '参考配置尚未就绪'; return null }
  try {
    if (externalPlan && externalPlan.profileId !== reference.profile.id) throw Error('导入计划的卫星配置 ID 与当前参考配置不一致')
    const plan = externalPlan ?? (scenario === 'survey' ? generateSurveyPlan(reference.profile, day, environment)
      : generateTrackingPlan(reference.profile, day, environment,
        asteroids.filter(a => a.des).map(a => ({ id: a.des!, name: a.name }))))
    cached = preparePlan(plan, environment)
  } catch (error) { cachedError = error instanceof Error ? error.message : '观测计划不可用' }
  return cached
}
export function getPlanError() { return cachedError }
export function getObservationPlayback(jd: number) {
  const prepared = getObservationPlan(jd)
  return prepared ? { prepared, ...evaluatePlan(prepared, jd) } : null
}
