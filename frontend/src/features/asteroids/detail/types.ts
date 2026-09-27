import type { RiskLevel } from '@/services/statsService';
import type { ObsTask } from '@/services/obsTaskService';
import type { AsteroidElements } from '@/utils/orbital/asteroids';
import type { Approach, EarthRelation } from '@/utils/orbital/encounter';

/** 专题页目标统一视图: 命名小行星与 MPCORB 云粒子共用同一套推演。 */
export interface AsteroidTarget {
  el: AsteroidElements;
  name: string;
  en: string;
  cls: string;
  diam: number;
  spinH?: number;
  kind: 'ast' | 'cloud';
  index: number;
}

export interface AsteroidRealtimeState {
  distSun: number;
  distEarth: number;
  speed: number;
}

export interface AsteroidStaticAnalysis {
  moid: number;
  relation: EarthRelation;
  approaches: Approach[];
  periodYr: number;
  energyMt: number;
  baseJd: number;
  neo: boolean;
  pha: boolean;
}

/** 左右详情栏共享的只读视图模型。 */
export interface AsteroidDetailModel {
  vm: AsteroidTarget;
  jd: number;
  realtime: AsteroidRealtimeState;
  analysis: AsteroidStaticAnalysis;
  obsTasks: ObsTask[];
  risk: RiskLevel;
  reasons: string[];
  massKg: number;
  massExp: number;
  inComp: boolean;
  toggleComp: () => void;
  back: () => void;
}
