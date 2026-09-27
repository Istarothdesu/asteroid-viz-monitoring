import { useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useDataStore } from '@/store/dataStore';
import { useSelectionStore } from '@/store/selectionStore';
import { useSimStore } from '@/store/simStore';
import { useLiveJd } from '@/hooks/useLiveJd';
import { sceneRef } from '@/core/SceneManager';
import { getGroundStationProvider } from '@/features/ground/stationProvider';
import { STATION_SPECS } from '@/data/stationSpecs';
import {
  generateStationTasks,
  stationTargetVisible,
} from '@/services/obsTaskService';
import { PLANETS } from '@/data/planets';
import { astPos } from '@/utils/orbital/asteroids';
import { planetPos } from '@/utils/orbital/planets';
import { AU_KM } from '@/utils/orbital/constants';
import { jdToDate } from '@/utils/orbital/time';
import type { Vec3Like } from '@/utils/orbital/kepler';
import type { SelectionTarget } from '@/types/scene';
import {
  StationDetailContext,
  type StationDetailModel,
} from './StationDetailContext';

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
 * 监测站专题详情 Provider (headless): 承载路由解析、场景联动、
 * 昼夜/可观测目标/计划任务的实时推演; 左右两列由 StationLayout
 * 按左中右弹性结构分别摆放。
 */
export default function StationDetailProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { idx: idxStr } = useParams();
  const idx = Number(idxStr);
  const navigate = useNavigate();

  const asteroids = useDataStore((s) => s.asteroids);
  const selected = useSelectionStore((s) => s.selected);
  const setSelected = useSelectionStore((s) => s.setSelected);
  const clearSelection = useSelectionStore((s) => s.clearSelection);

  const st = Number.isInteger(idx) ? getGroundStationProvider().getStations()[idx] : undefined;
  const spec = st ? STATION_SPECS[st.name] : undefined;

  /* 页面主体 (选中态): 三维里的单站聚焦高亮, 空白点击后据此复位 */
  const subject = useMemo<SelectionTarget | null>(
    () => (st ? { kind: 'station', idx } : null),
    [st, idx],
  );

  /* back() 主动清空选中时置位, 避免下方订阅又把主体写回 */
  const leaving = useRef(false);

  useEffect(() => {
    if (subject) setSelected(subject);
  }, [subject, setSelected]);

  /* 空白点击: picking 已解除跟随请求, 此处写回页面主体, 详情页不失焦 */
  useEffect(() => {
    const unsub = useSelectionStore.subscribe((state) => {
      if (leaving.current || state.selected) return;
      if (subject) setSelected(subject);
    });
    return unsub;
  }, [subject, setSelected]);

  /* 导航守卫: 场景中选中其他监测站时原地切换专题 (防死循环: 自身索引不触发) */
  useEffect(() => {
    if (selected?.kind === 'station' && selected.idx !== idx) {
      navigate(`/station/${selected.idx}`);
    }
  }, [selected, idx, navigate]);

  /* 实时状态: 昼夜/光锥由场景逐帧计算, 低频订阅仿真时钟刷新 */
  const jd = useLiveJd(1000);
  const night = useMemo(
    () => (st ? (sceneRef.current?.getStationNight(idx) ?? false) : false),
    [jd, idx], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /* 观测站地方平时 (按经度偏移, 演示口径) */
  const localTime = useMemo(() => {
    if (!st) return '';
    const d = jdToDate(jd);
    const h =
      (d.getUTCHours() + d.getUTCMinutes() / 60 + st.lon / 15 + 24) % 24;
    return `${String(Math.floor(h)).padStart(2, '0')}:${String(
      Math.floor((h % 1) * 60),
    ).padStart(2, '0')}`;
  }, [jd, st]);

  /* 当前可观测目标: 命名小行星库逐目标实时可见性判定 (夜间+高度角≥30°+离日≥30°) */
  const visibleTargets = useMemo(() => {
    if (!st) return [];
    const pe = v3();
    const pa = v3();
    planetPos(EARTH, jd, pe);
    return asteroids
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => stationTargetVisible(a, st, jd))
      .map(({ a, i }) => {
        astPos(a, jd, pa);
        const dist = Math.hypot(pa.x - pe.x, pa.y - pe.y, pa.z - pe.z) * AU_KM;
        return { a, i, dist };
      })
      .sort((x, y) => x.dist - y.dist)
      .slice(0, 10);
  }, [asteroids, jd, st]);

  /* 计划观测任务: 未来 21 天窗口推演 (进入时刻为基准, 同小行星专题口径) */
  const baseJd = useMemo(() => useSimStore.getState().jd, []);
  const stationTasks = useMemo(() => {
    if (!st) return [];
    return generateStationTasks(
      idx,
      asteroids.map((a) => ({ el: a, des: a.name })),
      baseJd,
    );
  }, [asteroids, idx, baseJd, st]);

  let model: StationDetailModel | null = null;
  if (st) {
    model = {
      idx,
      st,
      spec,
      night,
      localTime,
      visibleTargets,
      stationTasks,
      back: () => {
        leaving.current = true;
        clearSelection();
        navigate('/situation/ground');
      },
    };
  }

  return (
    <StationDetailContext.Provider value={model}>
      {children}
    </StationDetailContext.Provider>
  );
}
