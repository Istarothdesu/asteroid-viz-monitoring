/* ============================================================================
 * impact.ts — 撞击事件物理估算
 *
 * 新建撞击事件时由直径自动估算 TNT 当量能量, 再由能量估算冲击波影响范围,
 * 二者在表单中均可手动覆盖 (通古斯: 8 km 空爆 / 2000 km² / 12 Mt)。
 * ========================================================================== */

const IMPACT_DENSITY = 3000      // kg/m³: 石质小行星典型密度
const IMPACT_SPEED = 20000       // m/s: 地球撞击典型速度
const JOULE_PER_MT = 4.184e15    // J: 1 Mt TNT 当量
const R_EARTH_KM = 6371

/** 动能估算: 球体质量 × v²/2, 换算为 Mt TNT 当量 (50 米≈9.4 Mt, 接近通古斯) */
export function estimateEnergyMt(diamM: number): number {
  const mass = IMPACT_DENSITY * (Math.PI / 6) * Math.max(diamM, 0.1) ** 3
  return (0.5 * mass * IMPACT_SPEED ** 2) / JOULE_PER_MT
}

/** 冲击波影响范围估算: 爆炸冲击波立方根标度律, 面积 ∝ E^(2/3)。
    按通古斯 (12 Mt ≈ 2150 km²) 标定: A ≈ 408 × E^(2/3) km² */
export function shockAreaFromEnergy(energyMt: number): number {
  return 408 * Math.max(energyMt, 1e-4) ** (2 / 3)
}

/* 冲击波范围 → 球面波最大传播角半径。真实球冠角半径不足 1°, 仿真尺度下
   不可见, 适度放大保持可读 (通古斯 2000 km² → ≈0.12 rad ≈ 6.8°, 等效半径
   ~760 km); 封顶 π。系数过大曾导致波环覆盖整个半球, 与设定范围严重不符 */
const SHOCK_VIS_K = 30

export function shockAngFromArea(areaKm2: number): number {
  const th = Math.sqrt(Math.max(areaKm2, 1) / (Math.PI * R_EARTH_KM * R_EARTH_KM))
  return Math.min(Math.PI, th * SHOCK_VIS_K)
}

/** 能量显示: 不足 1 Mt 自动换算为 kt */
export function fmtEnergy(energyMt: number): string {
  return energyMt < 1 ? `${(energyMt * 1000).toFixed(1)} kt` : `${energyMt.toFixed(1)} Mt`
}
