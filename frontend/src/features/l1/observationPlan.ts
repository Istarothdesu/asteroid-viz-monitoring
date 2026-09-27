import { attitudeAxes, footprintRadius, interpolateQuaternion, quaternionAngle, separation } from './attitude'
import type { Quaternion } from './attitude'
import { add, norm, scale, unit } from './runtime'
import type { MissionProfile, ObserverState, Vector } from './types'
import { earthAvoidanceRadius } from './constraints'

export const SECONDS_PER_DAY = 86400
export type ActivityKind = 'slew' | 'settle' | 'exposure' | 'wait' | 'calibration'
export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  slew: '转向', settle: '稳定', exposure: '仿真曝光', wait: '等待', calibration: '校准示意',
}
export interface PoseSample { jdTdb: number; quaternion: Quaternion }
export interface PlanActivity {
  id: string; name: string; kind: ActivityKind; start: number; end: number
  interpolation: 'linear' | 'smoothstep'; poses: PoseSample[]
  visitId?: string; fieldId?: string; revisit?: number; targetId?: string; targetName?: string
}
export interface ObservationPlan {
  schemaVersion: 1; id: string; version: number; name: string
  source: 'simulation' | 'external-plan'; provenance: string; assumptions: string[]
  profileId: string; frame: 'ECLIPJ2000'; timeScale: 'TDB'
  attitudeConvention: 'instrument-to-eclipj2000-xyzw-minus-z'
  start: number; end: number; instrument: MissionProfile['instrument']
  limits: { slewRateDegPerSec: number; slewAccelerationDegPerSec2: number }
  activities: PlanActivity[]
}
export interface PlanEnvironment {
  observer: (jd: number) => ObserverState | null
  targetPosition?: (id: string, jd: number) => Vector | null
}
export interface GeometryCheck { valid: boolean; reason: string }
export interface ExposureFootprint {
  activity: PlanActivity; poses: Quaternion[]; check: GeometryCheck
}
export interface PreparedPlan {
  plan: ObservationPlan; checks: Map<string, GeometryCheck>; exposures: ExposureFootprint[]
}
export interface PlanCoverageSummary {
  plannedFields: number; coveredFields: number; fieldCompletionPercent: number
  plannedVisits: number; completedVisits: number
}

/** 外部适配器与模拟器共用契约；拒绝歧义坐标、重叠活动和缺少滚转的姿态。 */
export function validatePlan(plan: ObservationPlan): void {
  if (plan.schemaVersion !== 1 || plan.frame !== 'ECLIPJ2000' || plan.timeScale !== 'TDB'
    || plan.attitudeConvention !== 'instrument-to-eclipj2000-xyzw-minus-z'
    || !['simulation', 'external-plan'].includes(plan.source)) throw Error('观测计划坐标、时标或姿态约定不受支持')
  if (!plan.id || !plan.name || !Number.isInteger(plan.version) || plan.version < 1
    || !plan.profileId || !plan.provenance || !Array.isArray(plan.assumptions)
    || !Number.isFinite(plan.start) || !Number.isFinite(plan.end) || !(plan.end > plan.start)
    || !(plan.instrument.fovWidthDeg > 0 && plan.instrument.fovWidthDeg < 90)
    || !(plan.instrument.fovHeightDeg > 0 && plan.instrument.fovHeightDeg < 90)
    || !(plan.instrument.sunAvoidanceDeg >= 0 && plan.instrument.maxSunElongationDeg <= 180
      && plan.instrument.maxSunElongationDeg > plan.instrument.sunAvoidanceDeg)
    || !(Number.isFinite(plan.instrument.earthAvoidanceMarginDeg)
      && plan.instrument.earthAvoidanceMarginDeg >= 0 && plan.instrument.earthAvoidanceMarginDeg < 90)
    || !(Number.isFinite(plan.limits.slewRateDegPerSec) && plan.limits.slewRateDegPerSec > 0
      && Number.isFinite(plan.limits.slewAccelerationDegPerSec2) && plan.limits.slewAccelerationDegPerSec2 > 0)
    || !plan.activities?.length) throw Error('观测计划元数据或仪器参数不完整')
  const ids = new Set<string>()
  let previous: PlanActivity | undefined
  for (const a of plan.activities) {
    if (!(a.kind in ACTIVITY_LABEL) || !['linear', 'smoothstep'].includes(a.interpolation)
      || !a.id || ids.has(a.id) || !Number.isFinite(a.start) || !Number.isFinite(a.end) || !(a.end > a.start)
      || a.start < plan.start || a.end > plan.end || (previous && a.start < previous.end)
      || !Array.isArray(a.poses) || a.poses.length < 2 || Math.abs(a.poses[0].jdTdb-a.start) > 1e-9
      || Math.abs(a.poses.at(-1)!.jdTdb-a.end) > 1e-9) throw Error('活动时序、ID 或姿态覆盖不合法')
    a.poses.forEach((p, k) => {
      if (!Number.isFinite(p.jdTdb) || p.quaternion?.length !== 4 || !p.quaternion.every(Number.isFinite)
        || Math.abs(Math.hypot(...p.quaternion)-1) > 1e-6
        || (k && p.jdTdb <= a.poses[k-1].jdTdb)) throw Error('姿态采样必须按时间排序且四元数归一化')
      if (k) {
        const dt = (p.jdTdb-a.poses[k-1].jdTdb)*SECONDS_PER_DAY
        const angle = quaternionAngle(a.poses[k-1].quaternion, p.quaternion)*180/Math.PI
        const smooth = a.interpolation === 'smoothstep'
        if (angle*(smooth ? 1.5 : 1)/dt > plan.limits.slewRateDegPerSec + 1e-5
          || (smooth && 6*angle/(dt*dt) > plan.limits.slewAccelerationDegPerSec2 + 1e-5)) throw Error('姿态变化超过计划声明的转向速率或加速度')
      }
    })
    if (previous && Math.abs(a.start-previous.end) < 1e-9
      && quaternionAngle(previous.poses.at(-1)!.quaternion, a.poses[0].quaternion) > 1e-6) throw Error('相邻活动姿态不连续')
    ids.add(a.id); previous = a
  }
}

export function activityPose(a: PlanActivity, jd: number): Quaternion {
  const samples = a.poses
  let lo = 0, hi = samples.length-1
  while (hi-lo > 1) { const m = (hi+lo)>>1; if (samples[m].jdTdb <= jd) lo = m; else hi = m }
  let t = Math.max(0, Math.min(1, (jd-samples[lo].jdTdb)/(samples[hi].jdTdb-samples[lo].jdTdb)))
  if (a.interpolation === 'smoothstep') t = t*t*(3-2*t)
  return interpolateQuaternion(samples[lo].quaternion, samples[hi].quaternion, t)
}

export function checkPose(q: Quaternion, jd: number, plan: ObservationPlan, env: PlanEnvironment): GeometryCheck {
  const obs = env.observer(jd)
  if (!obs) return { valid: false, reason: '星历未覆盖，几何不可判定' }
  const axis = attitudeAxes(q).axis, i = plan.instrument
  const radius = footprintRadius(i.fovWidthDeg, i.fovHeightDeg)
  const sunAngle = separation(axis, scale(obs.positionAu, -1))
  if (sunAngle-radius < i.sunAvoidanceDeg*Math.PI/180 || sunAngle+radius > i.maxSunElongationDeg*Math.PI/180)
    return { valid: false, reason: '视场保守包络超出太阳允许角范围' }
  const earth = add(obs.earthPositionAu, scale(obs.positionAu, -1))
  const earthRadius = earthAvoidanceRadius(norm(earth), i.earthAvoidanceMarginDeg)
  if (separation(axis, earth) <= radius+earthRadius) return { valid: false, reason: '视场保守包络进入地球规避区（视半径＋仿真余量）' }
  return { valid: true, reason: '保守视场包络检查通过（非飞行可执行性证明）' }
}

/** 每 5 SI 秒及全部姿态节点检查；不冒充连续时间的完整工程验证。 */
export function checkActivity(a: PlanActivity, plan: ObservationPlan, env: PlanEnvironment): GeometryCheck {
  const count = Math.max(1, Math.ceil((a.end-a.start)*SECONDS_PER_DAY/5))
  const times = [...a.poses.map(p => p.jdTdb), ...Array.from({ length: count+1 }, (_, k) => a.start+(a.end-a.start)*k/count)]
  for (const jd of times) {
    const check = checkPose(activityPose(a, jd), jd, plan, env)
    if (!check.valid) return check
  }
  return { valid: true, reason: '5 秒采样与姿态节点的保守几何检查通过' }
}

export function preparePlan(plan: ObservationPlan, env: PlanEnvironment): PreparedPlan {
  validatePlan(plan)
  const checks = new Map<string, GeometryCheck>(), exposures: ExposureFootprint[] = []
  for (const a of plan.activities) {
    // 等待/校准没有曝光，但仍能展示当时的几何约束情况。
    const check = checkActivity(a, plan, env)
    checks.set(a.id, check)
    if (a.kind === 'exposure') {
      const moving = a.poses.some(p => quaternionAngle(p.quaternion, a.poses[0].quaternion) > 1e-8)
      const count = moving ? Math.max(1, Math.ceil((a.end-a.start)*SECONDS_PER_DAY/5)) : 0
      const poses = Array.from({ length: count+1 }, (_, k) => activityPose(a, count ? a.start+(a.end-a.start)*k/count : a.start))
      exposures.push({ activity: a, poses, check })
    }
  }
  return { plan, checks, exposures }
}

/** 半开区间；未规划的空档不虚构姿态，更不虚构真实执行反馈。 */
export function evaluatePlan(prepared: PreparedPlan, jd: number) {
  const list = prepared.plan.activities
  let lo = 0, hi = list.length
  while (lo < hi) { const m = (lo+hi)>>1; if (list[m].start <= jd) lo = m+1; else hi = m }
  const activity = list[lo-1]
  const current = activity && jd < activity.end ? activity : null
  return { activity: current, quaternion: current ? activityPose(current, jd) : null,
    check: current ? prepared.checks.get(current.id)! : null,
    completedExposures: prepared.exposures.filter(e => e.check.valid && e.activity.end <= jd).length,
    validExposures: prepared.exposures.filter(e => e.check.valid).length }
}

/**
 * 按计划标识统计进度，不把离散 fieldId 数量冒充球面面积覆盖率。
 * 仅纳入几何检查通过的曝光；一个天区完成任一曝光即视为已触达，
 * 一次复访则要等该 visitId 下全部有效曝光结束才计为完成。
 */
export function summarizePlanCoverage(prepared: PreparedPlan, jd: number): PlanCoverageSummary {
  const valid = prepared.exposures.filter(exposure => exposure.check.valid)
  const plannedFields = new Set<string>()
  const coveredFields = new Set<string>()
  const visits = new Map<string, PlanActivity[]>()

  valid.forEach(({ activity }) => {
    if (activity.fieldId) {
      plannedFields.add(activity.fieldId)
      if (activity.end <= jd) coveredFields.add(activity.fieldId)
    }
    if (activity.visitId) {
      const group = visits.get(activity.visitId) ?? []
      group.push(activity)
      visits.set(activity.visitId, group)
    }
  })

  const completedVisits = [...visits.values()]
    .filter(activities => activities.every(activity => activity.end <= jd)).length
  return {
    plannedFields: plannedFields.size,
    coveredFields: coveredFields.size,
    fieldCompletionPercent: plannedFields.size ? coveredFields.size / plannedFields.size * 100 : 0,
    plannedVisits: visits.size,
    completedVisits,
  }
}

export function targetQuaternionDirection(id: string, jd: number, env: PlanEnvironment): Vector | null {
  const target = env.targetPosition?.(id, jd), obs = env.observer(jd)
  return target && obs ? unit(add(target, scale(obs.positionAu, -1))) : null
}
