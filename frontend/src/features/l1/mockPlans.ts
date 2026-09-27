/** 展示用数据提供器；不放进渲染层，也不做正式任务优化。 */
import { pointingQuaternion, quaternionAngle, transportAttitude } from './attitude'
import type { Quaternion } from './attitude'
import { checkActivity, checkPose, SECONDS_PER_DAY, targetQuaternionDirection } from './observationPlan'
import type { ObservationPlan, PlanActivity, PlanEnvironment, PoseSample } from './observationPlan'
import { scale, vector } from './runtime'
import type { MissionProfile } from './types'

export interface TrackingTarget { id: string; name: string }
const NORTH = pointingQuaternion(vector(0, 0, 1))

class DemoBuilder {
  time: number
  pose: Quaternion = NORTH
  readonly plan: ObservationPlan
  readonly profile: MissionProfile
  readonly env: PlanEnvironment
  constructor(plan: ObservationPlan, profile: MissionProfile, env: PlanEnvironment) {
    this.plan = plan; this.profile = profile; this.env = env
    this.time = plan.start
  }
  append(kind: PlanActivity['kind'], seconds: number, name: string, to = this.pose,
    meta: Partial<PlanActivity> = {}, poses?: PoseSample[]) {
    if (seconds < .001) return
    const end = this.time+seconds/SECONDS_PER_DAY
    if (end > this.plan.end+1e-9) throw Error('演示活动超过计划范围，请减少天区数量或调整时间参数')
    this.plan.activities.push({ id: `${this.plan.id}-${this.plan.activities.length}`, name, kind,
      start: this.time, end: Math.min(end, this.plan.end), interpolation: kind === 'slew' ? 'smoothstep' : 'linear',
      poses: poses ?? [{ jdTdb: this.time, quaternion: this.pose }, { jdTdb: Math.min(end, this.plan.end), quaternion: to }], ...meta })
    this.time = Math.min(end, this.plan.end); this.pose = to
  }
  waitUntil(jd: number, name: string) {
    if (this.time > jd+1e-8) throw Error('演示活动无法满足声明的复访间隔')
    this.append('wait', Math.max(0, jd-this.time)*SECONDS_PER_DAY, name)
  }
  private slewDuration(to: Quaternion) {
    const angle = quaternionAngle(this.pose, to)*180/Math.PI, d = this.profile.demo
    // 三次 smoothstep 的最大速率=1.5θ/T，最大加速度=6θ/T²；两者同时约束。
    return Math.max(1.5*angle/d.slewRateDegPerSec, Math.sqrt(6*angle/d.slewAccelerationDegPerSec2), .01)
  }
  private directSlew(to: Quaternion, meta: Partial<PlanActivity>) {
    this.append('slew', this.slewDuration(to), '转向下一指向', to, meta)
  }
  slew(to: Quaternion, meta: Partial<PlanActivity> = {}) {
    const seconds = this.slewDuration(to)
    const candidate: PlanActivity = { id: 'candidate', name: '', kind: 'slew', start: this.time,
      end: this.time+seconds/SECONDS_PER_DAY, interpolation: 'smoothstep',
      poses: [{ jdTdb: this.time, quaternion: this.pose }, { jdTdb: this.time+seconds/SECONDS_PER_DAY, quaternion: to }] }
    if (!checkActivity(candidate, this.plan, this.env).valid) {
      // 先沿大圆到极区，再在极区调整滚转，最后沿大圆到目标；仍独立检查每段。
      this.directSlew(transportAttitude(this.pose, vector(0, 0, 1)), meta)
      this.directSlew(transportAttitude(to, vector(0, 0, 1)), meta)
    }
    this.directSlew(to, meta)
  }
  visit(q: Quaternion, meta: Partial<PlanActivity>) {
    this.slew(q, meta)
    this.append('settle', this.profile.demo.settleSeconds, '驻留稳定', q, meta)
    for (let n = 0; n < this.profile.demo.exposuresPerVisit; n++) {
      this.append('exposure', this.profile.demo.exposureSeconds, `仿真曝光 ${n+1}`, q, meta)
      this.append('wait', this.profile.demo.readoutSeconds, '读出等待', q, meta)
    }
  }
  finish() {
    this.slew(NORTH)
    const d = Math.floor(this.plan.start-.5)+.5, cal = this.profile.calibration
    const dayNo = Math.round(d-(Math.floor(this.profile.epochJdTdb-.5)+.5))
    if (((dayNo % cal.cycleDays)+cal.cycleDays)%cal.cycleDays === 0) {
      // 明确是极区驻留校准示意，不假造低温遥测或定标结果。
      const start = this.plan.end-cal.durationHours/24
      this.waitUntil(start, '等待校准示意时段')
      this.append('calibration', (this.plan.end-this.time)*SECONDS_PER_DAY, '极区校准示意')
    } else this.waitUntil(this.plan.end, '本轮完成，等待下一计划')
    return this.plan
  }
}

function basePlan(profile: MissionProfile, start: number, mode: string): ObservationPlan {
  return { schemaVersion: 1, id: `demo-${mode}-${profile.id}-${start}`, version: 1,
    name: mode === 'survey' ? '局部天区巡天与复访示例' : '已知小天体跟踪示例', source: 'simulation',
    provenance: mode === 'survey' ? profile.surveyReference : 'simulator:cached-ephemeris-target-tracking-v1',
    profileId: profile.id, frame: 'ECLIPJ2000', timeScale: 'TDB',
    attitudeConvention: 'instrument-to-eclipj2000-xyzw-minus-z', start, end: start+1,
    instrument: { ...profile.instrument }, limits: { slewRateDegPerSec: profile.demo.slewRateDegPerSec,
      slewAccelerationDegPerSec2: profile.demo.slewAccelerationDegPerSec2 },
    assumptions: ['仅参考分区曝光与复访思路，不复刻 NASA 全巡天方案或宣称策略最优',
      '视场、转向速率/加速度、稳定、曝光与读出时长为自定义参数',
      '每次访问含多次同指向曝光，未模拟抖动、探测器缝隙及读出死区',
      '采用保守视场包络，每 5 秒及姿态节点做日地几何检查；未建模月球、杂散光和完整姿态工程约束',
      '回放已结束的有效曝光仅称仿真曝光，不代表真实执行、探测或发现'], activities: [] }
}

export function generateSurveyPlan(profile: MissionProfile, start: number, env: PlanEnvironment): ObservationPlan {
  const plan = basePlan(profile, start, 'survey'), builder = new DemoBuilder(plan, profile, env)
  const obs = env.observer(start)
  if (!obs) throw Error('地球星历未覆盖计划开始，无法生成巡天示例')
  const sun = scale(obs.positionAu, -1), lambda = Math.atan2(sun.y, sun.x), d = profile.demo
  const planDay = Math.floor(start-.5)+.5, epochDay = Math.floor(profile.epochJdTdb-.5)+.5
  const dayNo = Math.round(planDay-epochDay), latCentre = (((dayNo%5)+5)%5-2)*Math.min(10, profile.survey.maxLatitudeDeg/4)
  const lonCentre = (profile.survey.minSolarLongitudeDeg+profile.survey.maxSolarLongitudeDeg)/2
  // 一天只执行太阳一侧的局部巡天；相邻计划日交替侧向，避免把长期双侧覆盖
  // 压缩成同一天内的机械镜像。正负号是相对太阳黄经的两侧，不代表固定惯性天区。
  const side = ((dayNo%2)+2)%2 === 0 ? 1 : -1
  const sideLabel = side > 0 ? '太阳东侧' : '太阳西侧'
  const sideKey = side > 0 ? 'east' : 'west'
  plan.name = `${plan.name} · ${sideLabel}`
  // 按计划开始时的太阳方向冻结当天惯性天区，曝光中不随太阳逐帧漂移。
  const fields = Array.from({ length: d.gridRows*d.gridColumns }, (_, k) => {
    const row = Math.floor(k/d.gridColumns), col = k%d.gridColumns
    const lon = (lonCentre+(col-(d.gridColumns-1)/2)*profile.instrument.fovWidthDeg*(1-d.overlapFraction))*side*Math.PI/180+lambda
    const lat = (latCentre+(row-(d.gridRows-1)/2)*profile.instrument.fovHeightDeg*(1-d.overlapFraction))*Math.PI/180
    return { id: `${sideKey}-${k}`, q: pointingQuaternion(vector(Math.cos(lat)*Math.cos(lon), Math.cos(lat)*Math.sin(lon), Math.sin(lat))) }
  })
  for (let repeat = 0; repeat < d.visitsPerField; repeat++) {
    const loopStart = start+repeat*d.revisitHours/24
    builder.waitUntil(loopStart, '等待下一轮复访')
    for (const field of fields) {
      builder.visit(field.q, { fieldId: field.id, revisit: repeat+1,
        visitId: `survey-${sideKey}-${repeat}-${field.id}` })
    }
  }
  plan.assumptions.push(`本计划日仅展示${sideLabel}的一个局部网格，相邻计划日交替到另一侧，不表示一天覆盖整个允许观测区域`,
    '侧向与黄纬带按计划日确定性轮换，仅用于形成可解释的覆盖节奏，不冒充正式覆盖优化结果',
    '循环启动间隔为自定义值；实际每个天区复访时间由活动时间表给出')
  return builder.finish()
}

export function generateTrackingPlan(profile: MissionProfile, start: number, env: PlanEnvironment,
  targets: TrackingTarget[]): ObservationPlan {
  const plan = basePlan(profile, start, 'tracking'), builder = new DemoBuilder(plan, profile, env)
  // 在当天选取星历覆盖且早/中/晚几何可用的已知目标；绝不静默降级到粗根数。
  const target = targets.find(t => [start, start+.5, start+1].every(jd => {
    const axis = targetQuaternionDirection(t.id, jd, env)
    return axis && checkPose(pointingQuaternion(axis), jd, plan, env).valid
  }))
  if (!target) throw Error('当前计划日没有星历覆盖且满足日地几何约束的跟踪目标')
  const qAt = (jd: number) => {
    const axis = targetQuaternionDirection(target.id, jd, env)
    if (!axis) throw Error('跟踪目标星历未覆盖计划时段')
    return pointingQuaternion(axis)
  }
  plan.name = `已知小天体跟踪示例 · ${target.name}`
  plan.assumptions.push('目标方向使用已有烘焙星历；曝光姿态每 5 秒采样并作四元数插值，不含光行时修正')
  for (const hour of [0, 6, 12, 18]) {
    builder.waitUntil(start+hour/24, '等待下一组目标跟踪')
    const meta = { visitId: `tracking-${hour}`, targetId: target.id, targetName: target.name }
    // 迭代确定转向结束时的目标方向，避免把转向开始时的目标位置当成结束时位置。
    let q = qAt(builder.time)
    for (let k = 0; k < 4; k++) {
      const angle = quaternionAngle(builder.pose, q)*180/Math.PI
      const seconds = Math.max(1.5*angle/profile.demo.slewRateDegPerSec,
        Math.sqrt(6*angle/profile.demo.slewAccelerationDegPerSec2))
      q = qAt(builder.time+seconds/SECONDS_PER_DAY)
    }
    builder.slew(q, meta)
    const stages: ('settle' | 'exposure' | 'wait')[] = ['settle']
    for (let n = 0; n < profile.demo.exposuresPerVisit; n++) stages.push('exposure', 'wait')
    for (const kind of stages) {
      const seconds = kind === 'settle' ? profile.demo.settleSeconds
        : kind === 'exposure' ? profile.demo.exposureSeconds : profile.demo.readoutSeconds
      const end = builder.time+seconds/SECONDS_PER_DAY
      const count = Math.ceil(seconds/5)
      const poses = Array.from({ length: count+1 }, (_, k) => {
        const jdTdb = builder.time+(end-builder.time)*k/count
        // 稳定阶段渐进消除转向末端的残差，曝光阶段每个节点均指向目标。
        return { jdTdb, quaternion: kind === 'settle' && k === 0 ? builder.pose : qAt(jdTdb) }
      })
      const name = kind === 'settle' ? '目标跟踪稳定' : kind === 'exposure' ? '目标跟踪仿真曝光' : '目标跟踪读出等待'
      builder.append(kind, seconds, name, poses.at(-1)!.quaternion, meta, poses)
    }
  }
  return builder.finish()
}
