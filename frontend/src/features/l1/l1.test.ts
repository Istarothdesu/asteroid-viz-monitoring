import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { clearEphemeris, ephemState, loadEphemeris } from '@/utils/orbital/ephemeris'
import { SurveySystem } from '@/core/SurveySystem'
import { getL1ObserverState, mapSynodicPosition, norm, setL1Reference, synodicState, vector } from './runtime'
import { pointingBasis, solarCoordinates, withinFov, withinInstrumentZone } from './geometry'
import { pointingQuaternion } from './attitude'
import { formatL1Time } from './store'
import type { L1Reference } from './types'
import { taskStatus } from '@/services/l1MissionService'

const JD = 2451545
// 合成状态只测试插值/映射契约，不冒充动力学解；真实解不变量由后端验证。
const reference: L1Reference = {
  profile: { id: 'test', version: 1, kind: 'simulation', name: 'test', timeScale: 'TDB', frame: 'ECLIPJ2000',
    positionUnit: 'AU', velocityUnit: 'AU/day', assumptions: [], epochJdTdb: JD,
    calibration: { cycleDays: 7, durationHours: 2 },
    instrument: { fovWidthDeg: 6, fovHeightDeg: 4, sunAvoidanceDeg: 45, maxSunElongationDeg: 125, earthAvoidanceMarginDeg: 5 },
    survey: { minSolarLongitudeDeg: 45, maxSolarLongitudeDeg: 120, maxLatitudeDeg: 40 },
    surveyReference: 'https://arxiv.org/html/2310.12918v1#S3',
    demo: { slewRateDegPerSec: .2, slewAccelerationDegPerSec2: .04, settleSeconds: 10,
      exposureSeconds: 20, readoutSeconds: 5, exposuresPerVisit: 6, visitsPerField: 4,
      revisitHours: 2, gridColumns: 4, gridRows: 4, overlapFraction: .1 } },
  orbit: { model: 'synthetic-test', source: 'test', sourceVersion: 'test', massRatio: 3e-6, lengthUnitAu: 1,
    timeUnitSeconds: 10 * 86400 / (2 * Math.PI), l1SynodicX: .99, phaseEpochJdTdb: JD,
    periodNormalized: 2 * Math.PI, periodDays: 10, validation: { closureAu: 0, jacobiDrift: 0 },
    samples: Array.from({ length: 65 }, (_, k) => {
      const t = k * 2 * Math.PI / 64
      return [.989, .001 * Math.sin(t), .003 * Math.cos(t), 0, .001 * Math.cos(t), -.003 * Math.sin(t)]
    }) },
}

function loadSyntheticEarth() {
  const name = new TextEncoder().encode('earth'), head = 25 + name.length
  const buffer = new ArrayBuffer(head + 72), dv = new DataView(buffer)
  dv.setUint16(0, 1, true); dv.setUint16(2, 1, true); dv.setUint8(4, name.length)
  new Uint8Array(buffer, 5, name.length).set(name)
  dv.setFloat64(5 + name.length, JD, true); dv.setFloat64(13 + name.length, 1, true)
  dv.setUint32(21 + name.length, 2, true)
  for (let k = 0; k < 2; k++) {
    dv.setFloat64(head + 24*k, 1, true); dv.setFloat64(head + 24*k + 8, .02*k, true)
    dv.setFloat32(head + 48 + 12*k + 4, .02, true)
  }
  loadEphemeris(buffer); setL1Reference(reference)
}

afterEach(() => { clearEphemeris(); setL1Reference(null) })

describe('L1 共享状态', () => {
  it('无参考模型 / 地球星历越界时明确不可用', () => {
    expect(getL1ObserverState(JD)).toBeNull()
    loadSyntheticEarth()
    expect(getL1ObserverState(JD + 2)).toBeNull()
  })
  it('轨道线采样与卫星位置同源；随动基正交', () => {
    loadSyntheticEarth()
    const state = getL1ObserverState(JD + .4)!
    const mapped = mapSynodicPosition(synodicState(state.jdTdb)!, state.earthPositionAu, state.basis)
    expect(mapped).toEqual(state.positionAu)
    state.basis.forEach(axis => expect(norm(axis)).toBeCloseTo(1, 12))
    expect(getL1ObserverState(state.jdTdb)).toBe(state)
    expect(state.earthDistanceAu).toBeGreaterThan(.01)
  })
  it('映射把两主天体严格对齐到太阳与真实地球位置', () => {
    loadSyntheticEarth()
    const state = getL1ObserverState(JD + .8)!, mu = reference.orbit.massRatio
    const sun = mapSynodicPosition([-mu, 0, 0], state.earthPositionAu, state.basis)
    expect(norm(sun)).toBeLessThan(1e-14)
    const earth = mapSynodicPosition([1 - mu, 0, 0], state.earthPositionAu, state.basis)
    expect(earth).toEqual(state.earthPositionAu)
  })
  it('映射速度与位置数值导数一致，不遗漏坐标基转动', () => {
    loadSyntheticEarth()
    const jd = JD + .4, a = getL1ObserverState(jd - .0001)!, b = getL1ObserverState(jd + .0001)!
    const state = getL1ObserverState(jd)!, h = b.jdTdb - a.jdTdb
    for (const d of ['x', 'y', 'z'] as const) {
      expect((b.positionAu[d] - a.positionAu[d]) / h).toBeCloseTo(state.velocityAuPerDay[d], 8)
    }
  })
  it('地球 Hermite 解析速度与插值位置一致', () => {
    loadSyntheticEarth()
    const p = vector(), v = vector()
    expect(ephemState('earth', JD + .5, p, v)).toBe(true)
    expect(v.y).toBeCloseTo(.02, 8)
    expect(p.y).toBeCloseTo(.01, 10)
  })
  it('参考周期首尾插值连续', () => {
    setL1Reference(reference)
    const a = synodicState(JD - 1e-6)!, b = synodicState(JD + 1e-6)!
    expect(Math.hypot(...a.slice(0, 3).map((v, k) => v - b[k]))).toBeLessThan(1e-8)
  })
})

describe('指向预览与显示解耦', () => {
  it('太阳相对黄经与伸长角不混用', () => {
    const angles = solarCoordinates(vector(.5, 0, .8660254), vector(1, 0, 0))
    expect(angles.longitudeDeg).toBe(0); expect(angles.elongationDeg).toBeCloseTo(60)
    expect(withinInstrumentZone(vector(.5, 0, .8660254), vector(1, 0, 0), reference.profile)).toBe(true)
  })
  it('图层显隐不改变扫描轴，视场统计没有虚构的距离截断', () => {
    const survey = new SurveySystem(new THREE.Group())
    survey.configure(reference.profile); survey.setConeActive(true)
    const sun = new THREE.Vector3(-1, 0, 0), earth = new THREE.Vector3(.01, 0, 0), sat = new THREE.Vector3()
    const q = pointingQuaternion(vector(0, 1, 0))
    survey.update(sun, earth, sat, q)
    const axis = survey.coneAxis.clone()
    survey.setSunAvoid(true); survey.setEarthAvoid(true); survey.setOccult(false)
    survey.update(sun, earth, sat, q)
    expect(survey.coneAxis.distanceTo(axis)).toBe(0)
    const [right, up] = pointingBasis(axis)
    expect(withinFov(axis.clone().multiplyScalar(10), axis, right, up, Math.tan(Math.PI / 60), Math.tan(Math.PI / 90))).toBe(true)
    const positions = new Float32Array(axis.clone().multiplyScalar(10).toArray())
    expect(survey.highlightGeometricSamples(positions, new Float32Array(3), new Float32Array(3), 1)).toBe(1)
  })
  it('太阳近侧、背日侧和地球规避球冠随配置与实际视距离变化', () => {
    const survey = new SurveySystem(new THREE.Group())
    survey.configure(reference.profile)
    survey.setSunAvoid(true); survey.setAntiSunLimit(true); survey.setEarthAvoid(true); survey.setOccult(true)
    const sun = new THREE.Vector3(-1, 0, 0), earth = new THREE.Vector3(.01, .002, 0)
    survey.update(sun, earth, new THREE.Vector3(), null)
    const zones = survey.group.children.flatMap(group => group.children)
    const zoneAngle = (color: number) => zones.find(zone => zone.userData.color === color)!.userData.angle as number
    expect(zoneAngle(0xee7777) * 180 / Math.PI).toBeCloseTo(45, 4)
    expect(zoneAngle(0xb998f0) * 180 / Math.PI).toBeCloseTo(55, 4)
    expect(zoneAngle(0x33aaff)).toBeCloseTo(zoneAngle(0xff9944) + 5 * Math.PI / 180, 8)
    expect(survey.antiSunLimitMark.position.x).toBeGreaterThan(0)
    expect(survey.earthAvoidMark.position.y).toBeGreaterThan(0)
  })
  it('时段采用半开区间，结束时不再占用当前预览', () => {
    expect(taskStatus({ id: 'test', kind: 'simulation-plan', name: '', type: 'survey', start: JD, end: JD + 1, params: [], purpose: '' }, JD + 1)).toBe('completed')
  })
})

describe('L1 时标显示', () => {
  it('缺少 UTC 映射时明确标注 TDB，不伪装成 UTC', () => {
    expect(formatL1Time(JD, null)).toBe('JD 2451545.000000 TDB')
  })
  it('闰秒显示 60 秒，前后按不同分段推进', () => {
    const axis = { startJdTdb: 0, endJdTdb: 1, samples: [[0, 1483228798000], [4/86400, 1483228801000]] as [number, number][],
      leaps: [{ startJdTdb: 2/86400, endJdTdb: 3/86400, label: '2016-12-31 23:59:60 UTC' }], source: 'test', assumption: '' }
    expect(formatL1Time(1/86400, axis)).toBe('2016-12-31 23:59:59 UTC')
    expect(formatL1Time(2.5/86400, axis)).toBe('2016-12-31 23:59:60 UTC')
    expect(formatL1Time(3.1/86400, axis)).toBe('2017-01-01 00:00:00 UTC')
  })
})
