import type { EventRecord } from '@/types/scene'
import { LD_KM, type EventDetail } from '@/services/eventCenter'
import { fmtKm } from '@/utils/orbital/time'
import { formatDiameter, formatEnergy } from './formatters'

export interface EventRiskConclusion {
  text: string
  tags: string[]
  advice: string
}

export function buildEventRiskConclusion(
  event: EventDetail,
  record: EventRecord | null,
  referenceJd: number,
): EventRiskConclusion {
  if (event.type === 'impact') {
    const energy = event.energyMt ?? 0
    const burstAltitude = record?.burstAltKm
    return {
      text: `遭遇时刻直径约 ${formatDiameter(event.diam)} 的天体撞击地球${
        burstAltitude ? `, 在 ${burstAltitude} km 高度空爆` : ', 直接撞击地表'
      }, 爆炸能量约 ${formatEnergy(energy)} TNT${
        record?.shockAreaKm2
          ? `, 冲击波影响范围约 ${Math.round(record.shockAreaKm2).toLocaleString()} km²`
          : ''
      }。`,
      tags: [
        '撞击事件',
        `能量 ${formatEnergy(energy)}`,
        burstAltitude ? '空中爆炸' : '地表撞击',
      ],
      advice: '可进入事件仿真查看已支持的演示流程；空爆与海面终态将分阶段接入。',
    }
  }

  const lunarDistance = (event.missKm ?? 0) / LD_KM
  return {
    text: `遭遇时刻该天体将以约 ${lunarDistance.toFixed(2)} 个月球距离 (${fmtKm(event.missKm ?? 0)}) 接近地球${
      event.vRelKms ? `, 相对速度约 ${event.vRelKms.toFixed(1)} km/s` : ''
    }${event.diam >= 0.14 ? '。直径满足潜在危险天体 (PHA) 尺寸判据' : ''}。`,
    tags: [
      '飞掠事件',
      `${lunarDistance.toFixed(2)} LD`,
      event.vRelKms ? `${event.vRelKms.toFixed(1)} km/s` : '',
    ],
    advice: event.jdEnc >= referenceJd
      ? '建议跳转事件时刻观察交会几何, 或进入仿真推演飞掠过程。'
      : '该事件已发生, 可进入仿真重现当时飞掠过程。',
  }
}
