import SceneOverlays from '@/components/layout/SceneOverlays';
import SearchLeftColumn from './SearchLeftColumn';
import SearchRightColumn from './SearchRightColumn';
import { useFrameStore, FRAME_INFO } from '@/store/frameStore';
import { TransitionGroup } from '@/components/common/transition';

/**
 * 全局检索布局 (左中右弹性结构, 参考 StationLayout):
 * 左列承载搜索框与分组结果列表, 右列承载选中结果详情与专题入口;
 * 查询词 (?q=) 与选中项 (?sel=) 均收敛于路由参数, 浏览器回退可还原
 * "结果列表 → 结果详情" 的浏览路径。
 * 中间区域承载态势标注与全部场景浮层, 三维场景由 App 层常驻。
 */
export default function SearchLayout() {
  const frame = useFrameStore((s) => s.frame);

  return (
    <div className="flex size-full flex-col overflow-hidden pointer-events-none">
      <div className="flex min-h-0 flex-1 pt-[10px]">
        {/* 左列: 搜索框/分组结果列表 */}
        <div
          className="w-[var(--left-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pl-2.5
            overflow-y-auto hud-scroll pointer-events-auto
            flex flex-col gap-2.5"
        >
          <TransitionGroup
            k={'search-left-column'}
            side="left"
            className="pointer-events-auto flex flex-col gap-2.5 h-full"
          >
            <SearchLeftColumn />
          </TransitionGroup>
        </div>

        {/* 中间区域: 宽高自适应, 承载态势标注与全部场景浮层 */}
        <div className="relative min-w-0 flex-1 pointer-events-none">
          <SceneOverlays
            profile="search"
            caption={`${FRAME_INFO[frame].label} · 全局检索 · 小行星 / 监测站 / 事件 / 任务`}
            hintExtra="点击结果在右侧查看详情"
          />
        </div>

        {/* 右列: 结果详情/详细信息/专题入口 */}
        <div
          className="w-[var(--right-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pr-2.5
            overflow-y-auto hud-scroll pointer-events-auto
            flex flex-col gap-2.5"
        >
          <TransitionGroup
            k={'search-right-column'}
            side="right"
            className="pointer-events-auto flex flex-col gap-2.5 h-full"
          >
            <SearchRightColumn />
          </TransitionGroup>
        </div>
      </div>
    </div>
  );
}
