import { createContext, useContext } from 'react';
import type { AsteroidRecord, GroundStation } from '@/types/asteroid';
import type { StationSpec } from '@/data/stationSpecs';
import type { ObsTask } from '@/services/obsTaskService';
import type { ObsTaskDetail } from '@/services/taskDetailMock';

/** 任务窗口状态 (相对当前仿真时刻) */
export type ObsTaskStatus = 'planned' | 'executing' | 'completed';

/** 观测任务专题页上下文模型: Provider 统一承载, 左右两列经 context 消费 */
export interface ObsTaskPageModel {
  task: ObsTask;
  /** 工程细节 (演示口径, 按任务 id 确定性派生) */
  detail: ObsTaskDetail;
  st?: GroundStation;
  spec?: StationSpec;
  target?: AsteroidRecord;
  targetIdx: number;
  /** 窗口开始时刻目标的地心距离 (km) */
  targetDistKm: number;
  jd: number;
  status: ObsTaskStatus;
  progress: number;
  /** 时间轴跳转至窗口开始 */
  jumpToStart: () => void;
  /** 仿真模拟: 跳转窗口开始并按窗口时长适配倍速播放 */
  simulate: () => void;
  back: () => void;
}

export const ObsTaskContext = createContext<ObsTaskPageModel | null>(null);

export function useObsTask(): ObsTaskPageModel | null {
  return useContext(ObsTaskContext);
}
