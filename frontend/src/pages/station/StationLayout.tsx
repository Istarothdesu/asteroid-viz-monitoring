import SceneOverlays from '@/components/layout/SceneOverlays';
import StationDetailProvider from './StationDetailProvider';
import StationLeftColumn from './StationLeftColumn';
import StationRightColumn from './StationRightColumn';
import { useFrameStore, FRAME_INFO } from '@/store/frameStore';
import { TransitionGroup } from '@/components/common/transition';

/**
 * 监测站专题布局 (左中右弹性结构, 参考 AsteroidLayout):
 * 左/右列为定宽 flex 项, 分别承载详情面板左列 (概况/设备/贡献)
 * 与右列 (实时观测状态/可观测目标/计划任务); 推演数据由 Provider 统一承载。
 * 中间区域宽高自适应, 承载态势标注与全部场景浮层 (图例/时间轴/
 * 坐标系切换/交互式图层图例), 各浮层相对中间区域定位。
 * 三维场景由 App 层常驻 (与态势页共享, 不重建)。
 */
export default function StationLayout() {
  const frame = useFrameStore((s) => s.frame);

  return (
    <StationDetailProvider>
      <div className="flex size-full flex-col overflow-hidden pointer-events-none">
        <div className="flex min-h-0 flex-1 pt-[10px]">
          {/* 左列: 返回/概况/望远镜与载荷/任务角色与贡献 */}
          <div
            className="w-[var(--left-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pl-2.5
              overflow-y-auto hud-scroll pointer-events-auto
              flex flex-col gap-2.5"
          >
            <TransitionGroup
              k={'station-left-column'}
              side="left"
              className="pointer-events-auto flex flex-col gap-2.5 h-full"
            >
              <StationLeftColumn />
            </TransitionGroup>
          </div>

          {/* 中间区域: 宽高自适应, 承载态势标注与全部场景浮层 */}
          <div className="relative min-w-0 flex-1 pointer-events-none">
            <SceneOverlays
              profile="ground-survey"
              caption={`${FRAME_INFO[frame].label} · 监测站专题 · 观测能力推演`}
              hintExtra="点击任务行跳转时刻"
            />
          </div>

          {/* 右列: 实时观测状态/当前可观测目标/计划观测任务 */}
          <div
            className="w-[var(--right-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pr-2.5
              overflow-y-auto hud-scroll pointer-events-auto
              flex flex-col gap-2.5"
          >
            <TransitionGroup
              k={'station-right-column'}
              side="right"
              className="pointer-events-auto flex flex-col gap-2.5 h-full"
            >
              <StationRightColumn />
            </TransitionGroup>
          </div>
        </div>
      </div>
    </StationDetailProvider>
  );
}
