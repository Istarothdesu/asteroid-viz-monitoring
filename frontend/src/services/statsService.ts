/**
 * 态势统计服务
 * 本次为静态 Mock 数据 (对齐设计图), 预留数据接口,
 * TODO: 后续替换为真实风险评估模型的输出。
 */

export type RiskLevel = 'high' | 'medium' | 'low' | 'normal';

export const RISK_META: Record<RiskLevel, { label: string; color: string }> = {
  high: { label: '高风险', color: '#ff4d4f' },
  medium: { label: '中风险', color: '#ff7043' },
  low: { label: '低风险', color: '#f5e642' },
  normal: { label: '正常', color: '#69f0ae' },
};

export interface SliceStat {
  name: string;
  value: number;
  color: string;
}

export interface OverviewStats {
  /** 监测目标总数 */
  total: number;
  /** 近地小行星数 */
  neo: number;
  /** 重点关注数 */
  focus: number;
  /** 高风险数 */
  highRisk: number;
  /** 数据更新时间 */
  updateTime: string;
  /** 风险等级分布 */
  riskDist: SliceStat[];
  /** 距日距离分布 (AU 分桶) */
  distBuckets: { label: string; value: number }[];
  /** 轨道类型分布 */
  orbitTypes: SliceStat[];
}

/**
 * 获取小行星态势统计数据。
 * 当前返回静态 Mock; 接入真实风险评估模型后改为请求后端接口, 调用方无需改动。
 */
export async function getOverviewStats(): Promise<OverviewStats> {
  return {
    total: 30,
    neo: 8,
    focus: 3,
    highRisk: 1,
    updateTime: new Date().toTimeString().slice(0, 8),
    riskDist: [
      { name: '高风险', value: 1, color: RISK_META.high.color },
      { name: '中风险', value: 3, color: RISK_META.medium.color },
      { name: '低风险', value: 8, color: RISK_META.low.color },
      { name: '正常', value: 18, color: RISK_META.normal.color },
    ],
    distBuckets: [
      { label: '<0.5', value: 2 },
      { label: '0.5-1', value: 6 },
      { label: '1-2', value: 7 },
      { label: '2-3', value: 8 },
      { label: '>3', value: 7 },
    ],
    orbitTypes: [
      { name: '主带小行星', value: 18, color: '#38e8ff' },
      { name: '近地小行星', value: 8, color: '#ff7043' },
      { name: '特洛伊小行星', value: 3, color: '#a98057' },
      { name: '其他', value: 1, color: '#8fb8c4' },
    ],
  };
}

/** 小行星风险等级映射 (Mock): key 为英文编号 (en 字段) */
const RISK_MAP: Record<string, RiskLevel> = {
  '2019 OK': 'high',
  '101955 Bennu': 'medium',
  '3200 Phaethon': 'medium',
  '3122 Florence': 'medium',
  '1566 Icarus': 'low',
  '4179 Toutatis': 'low',
  '65803 Didymos': 'low',
  '162173 Ryugu': 'low',
  '25143 Itokawa': 'low',
  '433 Eros': 'low',
  '153 Hilda': 'low',
};

/**
 * 查询单颗小行星的风险等级。
 * TODO: 接入真实风险评估模型后按轨道根数 + 接近概率动态计算。
 */
export function riskOf(en: string): RiskLevel {
  return RISK_MAP[en] ?? 'normal';
}
