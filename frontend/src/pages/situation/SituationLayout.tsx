import { useRef } from 'react';
import type { ComponentType } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ViewTabs from '@/components/center/ViewTabs';
import SceneOverlays from '@/components/layout/SceneOverlays';
import OverviewRightPanel from './overview/OverviewRightPanel';
import GroundRightPanel from './ground/GroundRightPanel';
import L1RightPanel from './l1/L1RightPanel';
import { TransitionGroup } from '@/components/common/transition';
import { useFrameStore, FRAME_INFO } from '@/store/frameStore';

/** 子路由 → 右栏组件 (查表渲染, 无分支逻辑)。
 *  视角与视图模式不在此派生: 由 RouteViewIntent 按 services/viewIntent 的意图表统一应用 */
const RIGHT_PANELS: Record<string, ComponentType> = {
  '/situation/overview': OverviewRightPanel,
  '/situation/l1': L1RightPanel,
  '/situation/ground': GroundRightPanel,
};

/** 任务详情等 l1 前缀子路由归属 L1 视图; 未匹配返回 undefined (index 重定向等瞬态路径) */
function getRight(pathname: string): ComponentType | undefined {
  if (pathname.startsWith('/situation/l1/')) return L1RightPanel;
  return RIGHT_PANELS[pathname];
}

/**
 * 实时态势布局 (左中右弹性结构):
 * 左/右栏为定宽 flex 项 (显示隐藏时中间区域自动伸缩);
 * 中间区域承载二级页签、态势标注与全部场景浮层 (图例/时间轴/坐标系切换/
 * 交互式图层图例等), 各浮层相对中间区域定位。
 * 三维场景已提升到 App 层常驻 (布局切换不重建 WebGL)。
 */
export default function SituationLayout() {
  const { pathname } = useLocation();
  const frame = useFrameStore((s) => s.frame); // 仅供中央标注显示当前坐标系

  const right = getRight(pathname);
  const Right = right ?? OverviewRightPanel;

  /* 过渡键仅在匹配到真实子页时更新: index 重定向等瞬态路径 (/situation)
     沿用上一有效键, 不触发额外退场/入场动画, 避免面板“隐藏-出现”闪烁;
     三个子页签 (overview/l1/ground) 互相切换仍正常播放过渡 */
  const lastKey = useRef(pathname);
  if (right) lastKey.current = pathname;
  const transitionKey = lastKey.current;
  const sceneProfile = pathname.startsWith('/situation/l1')
    ? 'l1-survey'
    : pathname.startsWith('/situation/ground')
      ? 'ground-survey'
      : 'overview';

  return (
    <div className="flex size-full flex-col overflow-hidden pointer-events-none">
      {/* 左中右: 顶栏避让 80px; 左右栏隐藏时中间区域自动占满 */}
      <div className="flex min-h-0 flex-1 pt-[10px]">
        {/* 左侧浮动列: 子路由面板 (入场/退场过渡) */}
        <div className="w-[var(--left-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pl-2.5 overflow-y-auto hud-scroll pointer-events-none">
          <TransitionGroup
            k={transitionKey}
            side="left"
            className="pointer-events-auto flex flex-col gap-2.5 h-full"
          >
            <Outlet />
          </TransitionGroup>
        </div>

        {/* 中间区域: 宽高自适应, 承载二级页签与全部场景浮层 */}
        <div className="relative min-w-0 flex-1 pointer-events-none">
          {/* 二级页签 (悬浮于中央区域顶部居中) */}
          <ViewTabs />
          <SceneOverlays
            profile={sceneProfile}
            caption={`${FRAME_INFO[frame].label} · 动态推演`}
            captionTop={52}
            hintExtra="点击天体选中"
          />
        </div>

        {/* 右栏: 由配置表派生 (L1 视图为任务体系面板, 其余视图为小行星面板) */}
        <div className="w-[var(--right-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pr-2.5 overflow-y-auto hud-scroll pointer-events-auto">
          <TransitionGroup
            k={transitionKey}
            side="right"
            className="pointer-events-auto flex flex-col gap-2.5 h-full"
          >
            <Right />
          </TransitionGroup>
        </div>
      </div>
    </div>
  );
}
