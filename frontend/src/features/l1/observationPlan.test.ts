import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { attitudeAxes, footprintRay, pointingQuaternion, quaternionAngle, rotateVector } from './attitude'
import { generateSurveyPlan, generateTrackingPlan } from './mockPlans'
import { activityPose, checkPose, evaluatePlan, preparePlan, summarizePlanCoverage, validatePlan } from './observationPlan'
import type { ObservationPlan, PlanEnvironment } from './observationPlan'
import type { MissionProfile, ObserverState } from './types'
import { add, dot, norm, scale, unit, vector } from './runtime'
import { SurveyFootprintRenderer } from '@/core/SurveyFootprintRenderer'

const JD = 2451544.5
const profile: MissionProfile = { id: 'test', version: 2, kind: 'simulation', name: 'test', frame: 'ECLIPJ2000', timeScale: 'TDB',
  positionUnit: 'AU', velocityUnit: 'AU/day', epochJdTdb: 2451545, assumptions: [], surveyReference: 'https://arxiv.org/html/2310.12918v1#S3',
  instrument: { fovWidthDeg: 6, fovHeightDeg: 4, sunAvoidanceDeg: 45, maxSunElongationDeg: 125, earthAvoidanceMarginDeg: 5 },
  survey: { minSolarLongitudeDeg: 45, maxSolarLongitudeDeg: 120, maxLatitudeDeg: 40 },
  calibration: { cycleDays: 7, durationHours: 2 },
  demo: { slewRateDegPerSec: .2, slewAccelerationDegPerSec2: .04, settleSeconds: 10,
    exposureSeconds: 20, readoutSeconds: 5, exposuresPerVisit: 6, visitsPerField: 4,
    revisitHours: 2, gridColumns: 4, gridRows: 4, overlapFraction: .1 } }
const observer = (jdTdb: number): ObserverState => ({ jdTdb, positionAu: vector(.99, 0, 0), earthPositionAu: vector(1, 0, 0),
  earthDistanceAu: .01, velocityAuPerDay: vector(), l1PointAu: vector(.99, 0, 0),
  basis: [vector(1, 0, 0), vector(0, 1, 0), vector(0, 0, 1)], source: 'CR3BP-following-map', earthSource: 'ephemeris', profileId: 'test' })
const env: PlanEnvironment = { observer }
const surveyPlan = generateSurveyPlan(profile, JD, env)
const prepared = preparePlan(surveyPlan, env)

describe('统一计划与模拟数据提供器', () => {
  it('巡天计划可复现、无重叠、姿态连续且几何检查通过', () => {
    expect(generateSurveyPlan(profile, JD, env)).toEqual(surveyPlan)
    expect(() => validatePlan(surveyPlan)).not.toThrow()
    expect(surveyPlan.activities[0].start).toBe(JD)
    expect(surveyPlan.activities.at(-1)!.end).toBe(JD+1)
    expect(prepared.exposures).toHaveLength(16*4*6)
    const failed = surveyPlan.activities.filter(a => !prepared.checks.get(a.id)!.valid)
    expect(failed.map(a => [a.name, prepared.checks.get(a.id)!.reason])).toEqual([])
    expect(quaternionAngle(surveyPlan.activities[0].poses[0].quaternion, surveyPlan.activities.at(-1)!.poses.at(-1)!.quaternion)).toBeLessThan(1e-6)
  })
  it('背景巡天按计划日只扫描一侧，并在相邻日换侧', () => {
    const next = generateSurveyPlan(profile, JD+1, env)
    const sides = (plan: ObservationPlan) => new Set(plan.activities
      .filter(a => a.kind === 'exposure')
      .map(a => a.fieldId?.split('-')[0]))
    expect(sides(surveyPlan)).toEqual(new Set(['east']))
    expect(sides(next)).toEqual(new Set(['west']))
    expect(surveyPlan.name).toContain('太阳东侧')
    expect(next.name).toContain('太阳西侧')
  })
  it('同一天区四次访问，曝光在访问内保持惯性方向', () => {
    const visits = prepared.exposures.filter(e => e.activity.fieldId === 'east-0')
    expect(new Set(visits.map(e => e.activity.visitId)).size).toBe(4)
    expect(new Set(visits.map(e => e.activity.revisit)).size).toBe(4)
    for (const e of visits) expect(e.activity.poses[0].quaternion).toEqual(e.activity.poses.at(-1)!.quaternion)
    const firsts = [1, 2, 3, 4].map(r => visits.find(e => e.activity.revisit === r)!.activity.start)
    // 初轮从极区启动，其启动转向耗时与后续复访不同；真实间隔由计划表给出。
    expect((firsts[2]-firsts[1])*24).toBeCloseTo(2, 5)
  })
  it('转向、等待、校准不累计曝光；倒退与重复回放一致', () => {
    const e = prepared.exposures[0], mid = (e.activity.start+e.activity.end)/2
    expect(evaluatePlan(prepared, mid).completedExposures).toBe(0)
    expect(evaluatePlan(prepared, e.activity.end).completedExposures).toBe(1)
    evaluatePlan(prepared, JD+1)
    expect(evaluatePlan(prepared, mid).completedExposures).toBe(0)
    expect(evaluatePlan(prepared, mid)).toEqual(evaluatePlan(prepared, mid))
    expect(evaluatePlan(prepared, JD+1).activity).toBeNull()
  })
  it('计划天区完成度按 fieldId 计数，复访要等同一 visit 的全部曝光结束', () => {
    const first = prepared.exposures[0].activity
    const visit = prepared.exposures.filter(e => e.activity.visitId === first.visitId)
    const duringFirstVisit = summarizePlanCoverage(prepared, first.end)
    expect(duringFirstVisit.plannedFields).toBe(16)
    expect(duringFirstVisit.coveredFields).toBe(1)
    expect(duringFirstVisit.completedVisits).toBe(0)

    const afterFirstVisit = summarizePlanCoverage(prepared, visit.at(-1)!.activity.end)
    expect(afterFirstVisit.coveredFields).toBe(1)
    expect(afterFirstVisit.completedVisits).toBe(1)

    expect(summarizePlanCoverage(prepared, JD + 1)).toEqual({
      plannedFields: 16,
      coveredFields: 16,
      fieldCompletionPercent: 100,
      plannedVisits: 64,
      completedVisits: 64,
    })
  })
  it('遮挡、视场边缘越界和星历缺失不显示有效曝光', () => {
    const centre = unit(vector(-Math.cos(46*Math.PI/180), Math.sin(46*Math.PI/180), 0))
    expect(checkPose(pointingQuaternion(centre), JD, surveyPlan, env).valid).toBe(false)
    expect(checkPose(pointingQuaternion(vector(1, 0, 0)), JD, surveyPlan, env).valid).toBe(false)
    const invalid = preparePlan(surveyPlan, { observer: () => null })
    expect(evaluatePlan(invalid, JD+1).completedExposures).toBe(0)
    expect(invalid.exposures[0].check.reason).toContain('不可判定')
  })
  it('拒绝错误时标、未归一化姿态、重叠活动和超限转向', () => {
    const change = (fn: (p: ObservationPlan) => void) => { const p = structuredClone(surveyPlan); fn(p); return p }
    expect(() => validatePlan(change(p => { p.timeScale = 'UTC' as 'TDB' }))).toThrow()
    expect(() => validatePlan(change(p => { p.activities[0].poses[0].quaternion = [0, 0, 0, 2] }))).toThrow()
    expect(() => validatePlan(change(p => { p.activities[1].start = p.activities[0].start }))).toThrow()
    expect(() => validatePlan(change(p => { p.limits.slewRateDegPerSec = .001 }))).toThrow()
    expect(() => validatePlan(change(p => { p.end = Infinity }))).toThrow()
    expect(() => validatePlan(change(p => { p.instrument.earthAvoidanceMarginDeg = -1 }))).toThrow()
    expect(() => validatePlan(change(p => { p.instrument.earthAvoidanceMarginDeg = NaN }))).toThrow()
  })
  it('地球规避校验采用实际地球方向与仿真余量，区分几何遮挡', () => {
    const rad = Math.PI / 180
    const direction = (deg: number) => vector(Math.cos(deg*rad), Math.sin(deg*rad), 0)
    const plan = structuredClone(surveyPlan)
    plan.instrument.fovWidthDeg = 1; plan.instrument.fovHeightDeg = 1
    const observerWithEarth: PlanEnvironment = { observer: jd => ({
      ...observer(jd), earthPositionAu: add(observer(jd).positionAu, scale(direction(72), .01)),
    }) }
    const near = pointingQuaternion(direction(67)), far = pointingQuaternion(direction(62))
    expect(checkPose(near, JD, plan, observerWithEarth).reason).toContain('地球规避区')
    expect(checkPose(far, JD, plan, observerWithEarth).valid).toBe(true)
    plan.instrument.earthAvoidanceMarginDeg = 0
    expect(checkPose(near, JD, plan, observerWithEarth).valid).toBe(true)
  })
  it('跟踪曝光轴与目标视线一致，不退回粗根数或虚构目标', () => {
    const targetEnv: PlanEnvironment = { observer, targetPosition: (_id, jd) => {
      const a = (90+(jd-JD))*Math.PI/180
      return add(observer(jd).positionAu, scale(vector(-Math.cos(a), Math.sin(a), 0), .1))
    } }
    const plan = generateTrackingPlan(profile, JD, targetEnv, [{ id: 'target', name: '合成测试目标' }])
    const p = preparePlan(plan, targetEnv)
    expect(p.exposures).toHaveLength(24)
    expect(plan.activities.filter(a => a.name === '目标跟踪读出等待')).toHaveLength(24)
    expect(p.exposures.every(e => e.check.valid)).toBe(true)
    for (const e of p.exposures) for (const pose of e.activity.poses) {
      const direction = unit(add(targetEnv.targetPosition!('target', pose.jdTdb)!, scale(observer(pose.jdTdb).positionAu, -1)))
      expect(dot(attitudeAxes(pose.quaternion).axis, direction)).toBeCloseTo(1, 10)
    }
    expect(() => generateTrackingPlan(profile, JD, env, [{ id: 'none', name: 'none' }])).toThrow('没有星历覆盖')
  })
})

describe('姿态与足迹渲染契约', () => {
  it('四元数包含滚转，光轴、右、上正交且与 Three 一致', () => {
    const q = pointingQuaternion(vector(.3, .8, .2)), axes = attitudeAxes(q)
    expect(dot(axes.axis, axes.right)).toBeCloseTo(0, 12)
    expect(dot(axes.axis, axes.up)).toBeCloseTo(0, 12)
    expect(norm(footprintRay(q, .05, .03))).toBeCloseTo(1, 12)
    const expected = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(...q))
    expect(new THREE.Vector3().copy(rotateVector(q, vector(0, 0, -1))).distanceTo(expected)).toBeLessThan(1e-12)
    const slew = surveyPlan.activities.find(a => a.kind === 'slew')!
    expect(quaternionAngle(activityPose(slew, slew.start), slew.poses[0].quaternion)).toBeLessThan(1e-6)
  })
  it('足迹图层仅改变显示，时间倒退撤销填充，换计划释放旧对象', () => {
    const renderer = new SurveyFootprintRenderer(.1)
    renderer.update(prepared, JD, true, true)
    const fills = () => renderer.group.children.filter(o => (o as THREE.Mesh).isMesh && o.visible).length
    expect(fills()).toBe(0)
    renderer.update(prepared, JD+1, true, true)
    expect(fills()).toBe(16)
    renderer.update(prepared, JD, true, true)
    expect(fills()).toBe(0)
    renderer.update(prepared, JD+1, false, false)
    expect(renderer.group.children.every(o => !o.visible)).toBe(true)
    renderer.update(null, JD, true, true)
    expect(renderer.group.children).toHaveLength(0)
  })
})
