import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useDataStore } from '@/store/dataStore';
import { useSelectionStore } from '@/store/selectionStore';
import { useSimStore } from '@/store/simStore';
import { useUIStore } from '@/store/uiStore';
import { useLiveJd } from '@/hooks/useLiveJd';
import { getGroundStationProvider } from '@/features/ground/stationProvider';
import { STATION_SPECS } from '@/data/stationSpecs';
import type { ObsTask } from '@/services/obsTaskService';
import { mockTaskDetail } from '@/services/taskDetailMock';
import { PLANETS } from '@/data/planets';
import { astPos } from '@/utils/orbital/asteroids';
import { planetPos } from '@/utils/orbital/planets';
import { AU_KM } from '@/utils/orbital/constants';
import { JD_MIN, JD_MAX } from '@/utils/orbital';
import type { Vec3Like } from '@/utils/orbital/kepler';
import {
  ObsTaskContext,
  type ObsTaskPageModel,
  type ObsTaskStatus,
} from './ObsTaskContext';

const EARTH = PLANETS[2];

function v3(): Vec3Like {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
}

/**
 * 观测任务专题 Provider (headless): 任务对象经路由 state 传入 (监测站页
 * "专题详情"按钮携带), 承载进入联动 (单站聚焦选中)、窗口状态推演与仿真
 * 模拟动作; 左右两列由 ObsTaskLayout 摆放。
 */
export default function ObsTaskProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { taskId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const asteroids = useDataStore((s) => s.asteroids);
  const selected = useSelectionStore((s) => s.selected);
  const setSelected = useSelectionStore((s) => s.setSelected);
  const setConeSweep = useUIStore((s) => s.setConeSweep);
  const setLocked = useSelectionStore((s) => s.setLocked);
  const setJD = useSimStore((s) => s.setJD);
  const setPlaying = useSimStore((s) => s.setPlaying);
  const setPlayRate = useSimStore((s) => s.setPlayRate);
  const setSimulationRange = useSimStore((s) => s.setSimulationRange);

  /* 任务对象由导航 state 携带 (列表确定性推演结果, 无需按路由重算) */
  const task = taskId
    ? (location.state as { task?: ObsTask } | null)?.task
    : undefined;

  /* 观测目标: 按任务参数中的目标名反查命名小行星库 */
  const targetName = task?.params.find(([k]) => k === '目标')?.[1] ?? '';
  const target = useMemo(
    () => asteroids.find((a) => a.name === targetName),
    [asteroids, targetName],
  );

  const st =
    task?.stationIdx != null
      ? getGroundStationProvider().getStations()[task.stationIdx]
      : undefined;
  const spec = st ? STATION_SPECS[st.name] : undefined;
  const detail = useMemo(() => (task ? mockTaskDetail(task) : null), [task]);

  /* 窗口开始时刻目标的地心距离 (展示口径) */
  const targetDistKm = useMemo(() => {
    if (!task || !target) return 0;
    const pa = v3(),
      pe = v3();
    astPos(target, task.windowStart, pa);
    planetPos(EARTH, task.windowStart, pe);
    return Math.hypot(pa.x - pe.x, pa.y - pe.y, pa.z - pe.z) * AU_KM;
  }, [task, target]);

  /* 进入联动: 选中任务所属监测站 (三维单站聚焦); 地心系 + 地面模式由路由意图施加 */
  useEffect(() => {
    if (!task || task.stationIdx == null) return;
    setSelected({ kind: 'station', idx: task.stationIdx });
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 进入联动：仿真范围限制为任务时段并停在开始时刻（默认暂停）；
     锁定选中 (点三维其他区域不取消单站聚焦); 启用光锥扫掠痕迹。
     退场时恢复全局仿真范围、播放与解锁（对齐 EventDetailLayout 模式）。 */
  useEffect(() => {
    if (!task) return;
    setSimulationRange(task.windowStart, task.windowEnd);
    setJD(task.windowStart);
    setPlaying(false);
    setLocked(true);
    setConeSweep(true);
    return () => {
      useSimStore.getState().setSimulationRange(JD_MIN, JD_MAX);
      useSimStore.getState().setPlaying(true);
      useSelectionStore.getState().setLocked(false);
      useUIStore.getState().setConeSweep(false);
    };
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 导航守卫: 场景中选中其他监测站时跳转对应站点专题 (自身索引不触发) */
  useEffect(() => {
    if (
      selected?.kind === 'station' &&
      task?.stationIdx != null &&
      selected.idx !== task.stationIdx
    ) {
      navigate(`/station/${selected.idx}`);
    }
  }, [selected, task?.stationIdx, navigate]);

  /* 窗口状态与进度 (随仿真时钟刷新) */
  const jd = useLiveJd(500);
  let status: ObsTaskStatus = 'planned';
  let progress = 0;
  if (task) {
    if (jd < task.windowStart) {
      status = 'planned';
      progress = 0;
    } else if (jd <= task.windowEnd) {
      status = 'executing';
      progress = (jd - task.windowStart) / (task.windowEnd - task.windowStart);
    } else {
      status = 'completed';
      progress = 1;
    }
  }

  let model: ObsTaskPageModel | null = null;
  if (task && detail) {
    model = {
      task,
      detail,
      st,
      spec,
      target,
      targetIdx: target ? asteroids.indexOf(target) : -1,
      targetDistKm,
      jd,
      status,
      progress,
      jumpToStart: () => setJD(task.windowStart),
      /* 仿真模拟: 跳至窗口开始, 按窗口时长按档适配倍速播放 */
      simulate: () => {
        const durDays = task.windowEnd - task.windowStart;
        setJD(task.windowStart);
        setPlayRate(durDays <= 0.5 ? 600 : durDays <= 2 ? 3600 : 86400);
        setPlaying(true);
      },
      back: () =>
        navigate(
          task.stationIdx != null
            ? `/station/${task.stationIdx}`
            : '/situation/ground',
        ),
    };
  }

  return <ObsTaskContext.Provider value={model}>{children}</ObsTaskContext.Provider>;
}
