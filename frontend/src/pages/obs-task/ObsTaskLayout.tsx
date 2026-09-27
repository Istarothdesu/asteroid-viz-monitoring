import SceneOverlays from '@/components/layout/SceneOverlays';
import ObsTaskProvider from './ObsTaskProvider';
import ObsTaskLeftColumn from './ObsTaskLeftColumn';
import ObsTaskRightColumn from './ObsTaskRightColumn';
import { useFrameStore, FRAME_INFO } from '@/store/frameStore';
import { TransitionGroup } from '@/components/common/transition';

/**
 * 观测任务专题布局 (左中右弹性结构, 参考 StationLayout):
 * 左列承载任务概览/观测目标/设施能力, 右列承载仿真执行与工程细节
 * (演示口径); 推演数据由 ObsTaskProvider 统一承载。
 * 中间区域承载态势标注与全部场景浮层, 三维场景由 App 层常驻。
 */
export default function ObsTaskLayout() {
  const frame = useFrameStore((s) => s.frame);

  return (
    <ObsTaskProvider>
      <div className="flex size-full flex-col overflow-hidden pointer-events-none">
        <div className="flex min-h-0 flex-1 pt-[10px]">
          {/* 左列: 返回/任务概览/观测目标/设施观测能力 */}
          <div
            className="w-[var(--left-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pl-2.5
              overflow-y-auto hud-scroll pointer-events-auto
              flex flex-col gap-2.5"
          >
            <TransitionGroup
              k={'obs-task-left-column'}
              side="left"
              className="pointer-events-auto flex flex-col gap-2.5 h-full"
            >
              <ObsTaskLeftColumn />
            </TransitionGroup>
          </div>

          {/* 中间区域: 宽高自适应, 承载态势标注与全部场景浮层 */}
          <div className="relative min-w-0 flex-1 pointer-events-none">
            <SceneOverlays
              profile="ground-survey"
              caption={`${FRAME_INFO[frame].label} · 观测任务专题 · 窗口推演与仿真`}
              hintExtra="开始仿真模拟后场景随窗口推演"
            />
          </div>

          {/* 右列: 仿真执行/工程细节/任务口径说明 */}
          <div
            className="w-[var(--right-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pr-2.5
              overflow-y-auto hud-scroll pointer-events-auto
              flex flex-col gap-2.5"
          >
            <TransitionGroup
              k={'obs-task-right-column'}
              side="right"
              className="pointer-events-auto flex flex-col gap-2.5 h-full"
            >
              <ObsTaskRightColumn />
            </TransitionGroup>
          </div>
        </div>
      </div>
    </ObsTaskProvider>
  );
}
