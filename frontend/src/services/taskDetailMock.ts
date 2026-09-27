/* ============================================================================
 * taskDetailMock.ts — 观测任务工程细节 mock (演示口径)
 *
 * 任务窗口与可见性由轨道几何真实推演 (见 obsTaskService), 但曝光计划 /
 * 预期精度 / 数据产品等工程细节无真实来源, 此处按任务 id 确定性派生
 * (同一任务任意时刻展示一致, 无随机)。专题页以"演示口径"标注。
 * ========================================================================== */

import type { ObsTask } from './obsTaskService';

export interface ObsTaskDetail {
  /** 提案编号 */
  proposal: string;
  /** 首席观测员 */
  pi: string;
  /** 单次曝光 */
  exposure: string;
  /** 拍摄计划 */
  frames: string;
  /** 观测节奏 */
  cadence: string;
  /** 预期信噪比 */
  snr: string;
  /** 测光/成像精度 */
  precision: string;
  /** 预期成果 */
  outcome: string;
  /** 数据归档 */
  archive: string;
}

/* 确定性散列: id → 32bit 整数 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const PIS = [
  '王悦 (巡天组)',
  '李昊然 (近地天体组)',
  '陈曦 (测光定标组)',
  '赵一鸣 (轨道定轨组)',
  '林清 (雷达观测组)',
  '周子昂 (后续观测组)',
];

/** 按任务确定性派生工程细节 (雷达站与光学站口径不同) */
export function mockTaskDetail(task: ObsTask): ObsTaskDetail {
  const h = hash(task.id);
  const pi = PIS[h % PIS.length];
  const radar = task.type === 'radar';
  const durH = (task.windowEnd - task.windowStart) * 24;

  if (radar) {
    return {
      proposal: `GS-${2026 + ((h >> 8) % 3)}-${String((h % 900) + 100)}`,
      pi,
      exposure: `X 波段 450 kW · 帧积分 ${8 + (h % 5) * 2} s`,
      frames: `${40 + (h % 80)} 帧延迟-多普勒成像`,
      cadence: `单帧 ${((h >> 4) % 4) + 2} min · 连续 ${Math.max(
        2,
        Math.round(durH / 6),
      )} 个时次`,
      snr: `单帧 ${12 + (h % 24)} dB`,
      precision: `距离分辨率 ${((h >> 6) % 8) * 1.875 + 3.75} m · 多普勒 ${
        ((h >> 10) % 4) * 0.25 + 0.25
      } Hz`,
      outcome: '延迟-多普勒像约束形状与自转状态, 轨道不确定度收敛 1–2 个量级',
      archive: '回波数据归档 PDS · 形状模型入库 DAMIT',
    };
  }

  const frames = 6 + (h % 12);
  return {
    proposal: `TAC-${2026 + ((h >> 8) % 3)}-${String((h % 900) + 100)}`,
    pi,
    exposure: `${[60, 90, 120, 180][h % 4]} s × 4 (抖动拼接剔宇宙线)`,
    frames: `窗口内 ${frames} 组, 覆盖 ${Math.max(
      1,
      Math.round(durH / frames),
    )} h 间隔`,
    cadence: `每晚天文昏终后 ${((h >> 4) % 3) + 1} h 内开始`,
    snr: `预测 ${18 + (h % 42)} (V 波段)`,
    precision: `天体测量 ${(((h >> 6) % 7) * 0.05 + 0.15).toFixed(2)}″ RMS`,
    outcome: '延长观测弧段, 收敛轨道不确定度并检验光度变化',
    archive: '天体测量记录上报 MPC · 光度曲线归档 SBN',
  };
}
