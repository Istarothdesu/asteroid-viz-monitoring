import type { CSSProperties, ReactNode } from 'react';
import type { SceneLayerProfile } from '@/core/sceneLayers';
import SceneLayersPanel from './SceneLayersPanel';
import BottomControlDock from './BottomControlDock';
import SimDigitalClock from '@/components/overlay/SimDigitalClock';
import EventSimulationOverlay from '@/components/overlay/EventSimulationOverlay';
import { useEventSimulationStore } from '@/store/eventSimulationStore';
import LabelsOverlay from '@/components/overlay/LabelsOverlay';
import EarthSurfaceStatus from '@/components/overlay/EarthSurfaceStatus';

/* 通用交互提示: 此前在 7 个布局里逐字复制, 收敛到此单点维护 */
const BASE_HINT = '左键拖动旋转 · 滚轮缩放 · 右键平移 · 空格 播放/暂停';
/* 视角约定提示: 选中与相机是两层, 空白点击只解除选中/跟随, 机位靠重点击坐标系复位 */
const VIEW_HINT = '点空白取消选中 · 再点当前坐标系回默认机位';

/**
 * 场景浮层标准组: 态势标注 / 交互式图层图例 / 坐标系切换 / 底部时间轴
 * + 仿真控制 / 标签层 / 操作提示。
 * 须置于中间区域 (relative 容器) 内使用, 各浮层相对该区域定位 ——
 * 左右栏对称的布局中即为视口居中。此前该块在 7 个布局中逐字复制,
 * 事件中心因缺少右栏导致标注/时间轴整体右偏, 收敛后由调用方保证对称。
 */
export default function SceneOverlays({
  caption,
  captionTop = 24,
  hintExtra,
  compact = false,
  showClock = true,
  profile,
}: {
  /** 态势标注文案 (顶部居中发光小字), 不传则不渲染 */
  caption?: ReactNode;
  /** 标注距区域顶部偏移 (px): 实时态势页有二级页签用 52, 默认 24 */
  captionTop?: number;
  /** 本页差异化的操作提示, 追加在通用提示之后 (通用交互与视角约定由组件统一给出) */
  hintExtra?: ReactNode;
  /** 紧凑时间轴 (事件专题: 时间轴贴底、坐标系切换上移, 给倒计时横幅让位) */
  compact?: boolean;
  /** 显示仿真电子钟 */
  showClock?: boolean;
  /** 页面业务语义，决定图层图例内容；不能用坐标系或数据偶然存在来推断。 */
  profile: SceneLayerProfile;
}) {
  const simulating = useEventSimulationStore(state => !!state.activeEvent)
  if (simulating) return <EventSimulationOverlay />
  return (
    <>
      {/* 顶部居中: 仿真电子钟 (七段数码管) 在上, 态势标注在下 ——
          复用 captionTop 作为整叠起点: 实时态势页 captionTop=52 恰好让开顶部 ViewTabs */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1.5 text-center"
        style={{ top: captionTop }}
      >
        {showClock && <SimDigitalClock />}
        {caption != null && (
          <div className="text-[11px] text-sky-300/90 tracking-[2px] glow-text">
            {caption}
          </div>
        )}
        <EarthSurfaceStatus />
      </div>

      {/* 图例与显隐控制共用单列面板；面板内部再按页面 profile 组合业务图层。 */}
      <div
        className="scene-layers-anchor"
        style={{ '--caption-top': `${captionTop}px` } as CSSProperties}
      >
        <SceneLayersPanel profile={profile} />
      </div>

      <BottomControlDock compact={compact} />

      {/* 态势标签层裁切在中央三维区域内 */}
      <LabelsOverlay />

      {/* 操作提示 (右下角): 通用交互 + 视角约定 + 本页差异 */}
      <div
        className="absolute right-2.5 bottom-2 z-15 max-w-[52%] text-right text-[11px] leading-relaxed
          text-sky-400/60 bg-[rgba(8,20,42,0.6)] px-2.5 py-1 rounded-sm border border-sky-400/15"
      >
        {BASE_HINT} · {VIEW_HINT}
        {hintExtra != null && <> · {hintExtra}</>}
      </div>
    </>
  );
}
