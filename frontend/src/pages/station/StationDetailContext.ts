import { createContext, useContext } from 'react';
import type { AsteroidRecord, GroundStation } from '@/types/asteroid';
import type { StationSpec } from '@/data/stationSpecs';
import type { ObsTask } from '@/services/obsTaskService';

/** 可观测目标: 实时可见性判定结果 (按距地距离升序, 取前 10) */
export interface VisibleTarget {
  a: AsteroidRecord;
  i: number;
  dist: number;
}

/** 监测站专题详情上下文模型: Provider 统一推演, 左右两列经 context 消费 */
export interface StationDetailModel {
  idx: number;
  st: GroundStation;
  spec?: StationSpec;
  night: boolean;
  localTime: string;
  visibleTargets: VisibleTarget[];
  stationTasks: ObsTask[];
  back: () => void;
}

export const StationDetailContext = createContext<StationDetailModel | null>(
  null,
);

export function useStationDetail(): StationDetailModel | null {
  return useContext(StationDetailContext);
}
