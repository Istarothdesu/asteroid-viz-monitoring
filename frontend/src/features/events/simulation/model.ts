import type { SimEventInput } from '@/store/simEventStore'
import type { EventRecord } from '@/types/scene'
import { estimateEnergyMt, shockAreaFromEnergy } from '@/utils/orbital/impact'
import type { ImpactPhysics, SimEventFormData } from './types'

export const EMPTY_SIM_EVENT_FORM: SimEventFormData = {
  name: '',
  desc: '',
  type: 'flyby',
  targetType: '石质小行星',
  diam: 50,
  dateUTC: new Date().toISOString().slice(0, 16),
  el: { a: 1.5, e: 0.4, i: 5, O: 100, w: 60 },
  missKm: 100000,
  leadH: 8,
}

export function resolveImpactPhysics(data: SimEventFormData): ImpactPhysics {
  if (data.type !== 'impact') return {}

  const energyMt = Math.max(0, data.energyMt ?? estimateEnergyMt(data.diam))
  return {
    burstAltKm: Math.max(0, data.burstAltKm ?? 0),
    energyMt,
    shockAreaKm2: Math.max(
      1,
      data.shockAreaKm2 ?? shockAreaFromEnergy(energyMt),
    ),
  }
}

/** 表单 → 场景绘制/仿真记录；EventRecord.diam 的单位是 km。 */
export function buildSimEventRecord(
  id: string,
  data: SimEventFormData,
): EventRecord {
  const physics = resolveImpactPhysics(data)
  return {
    id,
    name: data.name.trim() || '未命名推演',
    type: data.type,
    dateUTC: `${data.dateUTC}:00Z`,
    diam: data.diam / 1000,
    leadH: data.leadH,
    el: data.el,
    missKm: data.type === 'flyby' ? data.missKm : undefined,
    impactLat: data.type === 'impact' ? data.impactLat : undefined,
    impactLon: data.type === 'impact' ? data.impactLon : undefined,
    burstAltKm: physics.burstAltKm,
    shockAreaKm2: physics.shockAreaKm2,
    energyMt: physics.energyMt,
    img: '',
    credit: '',
    news: '',
    desc: data.desc,
  }
}

/** 表单 → 持久化输入；SimEventInput.diam 的单位是 m。 */
export function toSimEventInput(data: SimEventFormData): SimEventInput {
  const physics = resolveImpactPhysics(data)
  return {
    name: data.name.trim(),
    desc: data.desc,
    type: data.type,
    targetType: data.targetType,
    diam: data.diam,
    dateUTC: `${data.dateUTC}:00Z`,
    el: data.el,
    leadH: data.leadH,
    missKm: data.type === 'flyby' ? data.missKm : undefined,
    impactLat: data.type === 'impact' ? data.impactLat : undefined,
    impactLon: data.type === 'impact' ? data.impactLon : undefined,
    burstAltKm: physics.burstAltKm,
    shockAreaKm2: physics.shockAreaKm2,
    energyMt: physics.energyMt,
  }
}

/** 持久化事件 → 表单口径；datetime-local 不携带时区后缀。 */
export function toSimEventFormData(input: SimEventInput): SimEventFormData {
  return {
    ...input,
    dateUTC: input.dateUTC.slice(0, 16),
  }
}

export function simulationEncounterJd(data: SimEventFormData): number {
  return Date.parse(`${data.dateUTC}:00Z`) / 86400000 + 2440587.5
}

export function validateSimEvent(
  data: SimEventFormData,
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!data.name.trim()) errors.name = '事件名称必填'
  if (!(data.el.a > 0)) errors.a = '半长轴需大于 0'
  if (!(data.el.e >= 0 && data.el.e < 1)) {
    errors.e = '偏心率需在 [0, 1) 范围内'
  }
  if (!data.dateUTC || !Number.isFinite(simulationEncounterJd(data))) {
    errors.dateUTC = '遭遇时间必填且需有效'
  }
  if (!(data.diam > 0)) errors.diam = '直径需大于 0'
  if (!(data.leadH > 0)) errors.leadH = '提前显示时长需大于 0'
  if (data.type === 'flyby' && !((data.missKm ?? 0) >= 0)) {
    errors.missKm = '最近距离需不小于 0'
  }
  return errors
}

export function canPreviewSimEvent(data: SimEventFormData): boolean {
  return data.el.a > 0
    && data.el.e >= 0
    && data.el.e < 1
    && Number.isFinite(simulationEncounterJd(data))
}

/** 只包含会改变三维预览几何的字段，文本编辑不会触发重新拟合。 */
export function simulationPreviewKey(data: SimEventFormData): string {
  return JSON.stringify([
    data.type,
    data.diam,
    data.dateUTC,
    data.el,
    data.missKm,
    data.leadH,
    data.impactLat,
    data.impactLon,
    data.burstAltKm,
    data.energyMt,
    data.shockAreaKm2,
  ])
}

export function formatOptionalNumber(
  value: number | undefined,
  digits = 2,
  unit = '',
): string {
  return value != null && Number.isFinite(value)
    ? `${value.toFixed(digits)}${unit}`
    : '—'
}
