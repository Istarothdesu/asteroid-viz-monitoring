import SceneOverlays from '@/components/layout/SceneOverlays';
import AsteroidDetailProvider from '@/features/asteroids/detail/AsteroidDetailProvider';
import AsteroidLeftColumn from './AsteroidLeftColumn';
import AsteroidRightColumn from './AsteroidRightColumn';
import { useFrameStore, FRAME_INFO } from '@/store/frameStore';
import { TransitionGroup } from '@/components/common/transition';

/**
 * 小行星专题布局 (左中右弹性结构, 参考 SituationLayout):
 * 左/右列为定宽 flex 项, 分别承载详情面板左列 (概览/推演/危险评估/任务)
 * 与右列 (轨道信息/六根数/物理特征); 推演数据由 Provider 统一承载。
 * 中间区域宽高自适应, 承载态势标注与全部场景浮层 (图例/时间轴/
 * 坐标系切换/交互式图层图例), 各浮层相对中间区域定位。
 * 三维场景由 App 层常驻 (与态势页共享, 不重建)。
 */
export default function AsteroidLayout() {
  const frame = useFrameStore((s) => s.frame);

  return (
    <AsteroidDetailProvider>
      <div className="flex size-full flex-col overflow-hidden pointer-events-none">
        <div className="flex min-h-0 flex-1 pt-[10px]">
          {/* 左列: 返回/概览/实时推演/危险评估/观测任务 */}
          <div
            className="w-[var(--left-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pl-2.5
              overflow-y-auto hud-scroll pointer-events-auto
              flex flex-col gap-2.5"
          >
            <TransitionGroup
              k={'asteroid-left-column'}
              side="left"
              className="pointer-events-auto flex flex-col gap-2.5 h-full"
            >
              <AsteroidLeftColumn />
            </TransitionGroup>
          </div>

          {/* 中间区域: 宽高自适应, 承载态势标注与全部场景浮层 */}
          <div className="relative min-w-0 flex-1 pointer-events-none">
            <SceneOverlays
              profile="asteroid-detail"
              caption={`${FRAME_INFO[frame].label} · 小行星专题 · 动态推演`}
              hintExtra="点击接近事件行跳转时刻"
            />
          </div>

          {/* 右列: 轨道信息/六根数/物理特征 */}
          <div
            className="w-[var(--right-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pr-2.5
              overflow-y-auto hud-scroll pointer-events-auto
              flex flex-col gap-2.5"
          >
            <TransitionGroup
              k={'asteroid-right-column'}
              side="right"
              className="pointer-events-auto flex flex-col gap-2.5 h-full"
            >
              <AsteroidRightColumn />
            </TransitionGroup>
          </div>
        </div>
      </div>
    </AsteroidDetailProvider>
  );
}
