import { Sun, Earth, Satellite, Rocket, Crosshair } from 'lucide-react';
import type { ReactNode } from 'react';
import HexActionButton from '@/components/ui/HexActionButton';
import { HudCorners } from '@/components/ui/Panel';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFrameStore, FRAME_INFO } from '@/store/frameStore';
import { useCameraStore, useFollowing } from '@/store/cameraStore';
import { useDataStore } from '@/store/dataStore';
import { useSelectionStore } from '@/store/selectionStore';
import { useEventSimulationStore } from '@/store/eventSimulationStore';
import { selectionName } from '@/services/selection';
import type { FrameType } from '@/types/scene';

const FRAMES: {
  value: FrameType;
  label: string;
  icon: ReactNode;
}[] = [
  { value: 'helio', label: '日心黄道', icon: <Sun size={16} /> },
  { value: 'l1', label: 'L1观测中心', icon: <Satellite size={16} /> },
  { value: 'geo', label: '地心黄道', icon: <Earth size={16} /> },
  { value: 'comp', label: '目标伴飞', icon: <Rocket size={16} /> },
];

/**
 * 底部观察参考系快捷切换栏 (实时态势/小行星专题/事件中心共用)。
 *
 * 面板分左右两层, 用竖分隔线明确区分 —— 这是本组件要向用户讲清的核心概念:
 *   左 · 参考系 = **以谁为观察中心** (世界原点: 太阳/地球/L1仿真星/伴飞星)。
 *      它只决定坐标变换和标准机位，不决定巡天、地面监测等业务图层。
 *      再次点击已选中的按钮 = 回该参考系标准机位 (完整复位)。
 *   右 · 相机 = **我在哪、看哪里**。状态签显示注视状态, 「视角回中」只把注视点
 *      拉回世界中心、保持当前距离与方位 (日心系右键平移后想接着绕太阳转即用它)。
 *
 * 不参与路由: 实时态势的路由切换由 ViewTabs 承担, 路由派生视角由 RouteViewIntent
 * 按意图表统一应用, 此处的手动切换只在当前页面有效。
 */
export default function FrameSwitcher() {
  const frame = useFrameStore((s) => s.frame);
  const setFrame = useFrameStore((s) => s.setFrame);
  const compIdx = useFrameStore((s) => s.compIdx);
  const setCompIdx = useFrameStore((s) => s.setCompIdx);
  const followSpin = useFrameStore((s) => s.followSpin);
  const setFollowSpin = useFrameStore((s) => s.setFollowSpin);
  const asteroids = useDataStore((s) => s.asteroids);
  const selected = useSelectionStore((s) => s.selected);
  /* 事件目标名随仿真/预览态变化, 订阅以驱动状态签重算 */
  useEventSimulationStore((s) => s.activeEvent?.name ?? s.previewRec?.name);
  const following = useFollowing();
  const requestRecenter = useCameraStore((s) => s.requestRecenter);

  /* 世界中心天体名: 三系静态取自 FRAME_INFO, 伴飞系随目标 */
  const centerOf = (f: FrameType) =>
    f === 'comp'
      ? (asteroids[compIdx]?.name ?? '伴飞目标')
      : FRAME_INFO[f].center;

  const onFrameClick = (f: FrameType) => {
    const cam = useCameraStore.getState();
    if (f === frame) {
      // 再次点击当前坐标系: 回该坐标系标准机位 (注视点归零 + 默认机位 + 解除跟随)
      cam.requestReset();
      return;
    }
    /* 换帧: SceneManager 会在下一帧把相机复位到新坐标系标准机位。
       跟随需显式撤销 —— _setFrame 不再代劳, 否则会吞掉路由意图同步写入的跟随请求 */
    cam.setFollowRequest(false);
    setFrame(f);
  };

  return (
    <div className="pointer-events-auto">
      {/* 伴飞目标选择 (仅 comp 帧) */}
      {frame === 'comp' && (
        <div className="hud-panel relative rounded-sm px-3 py-2 mb-2 flex items-center gap-3 animate-float-in">
          <HudCorners />
          <span className="text-[11px] text-sky-400/90 whitespace-nowrap">
            伴飞目标
          </span>
          <Select
            value={String(compIdx)}
            onValueChange={(v) => {
              const idx = +v;
              setCompIdx(idx);
              // 切换伴飞目标同时选中该小行星
              useSelectionStore.getState().setSelected({ kind: 'ast', idx });
            }}
          >
            <SelectTrigger size="sm" className="w-[170px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {asteroids.map((a, i) => (
                <SelectItem key={a.en} value={String(i)}>
                  {a.name} ({a.en})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] whitespace-nowrap text-sky-300/90 hover:text-sky-100">
            <input
              type="checkbox"
              className="accent-sky-400"
              checked={followSpin}
              onChange={(e) => setFollowSpin(e.target.checked)}
            />
            跟随自转
          </label>
        </div>
      )}

      <div className="hud-panel relative rounded-sm px-4 py-2 flex items-center gap-3">
        <HudCorners />

        {/* 左 · 观察参考系: 世界中心是谁；业务内容由当前模块决定 */}
        {FRAMES.map((f) => (
          <HexActionButton
            key={f.value}
            icon={f.icon}
            label={f.label}
            active={frame === f.value}
            title={`观察参考系中心: ${centerOf(f.value)}${
              frame === f.value ? ' · 再次点击回标准机位' : ''
            }`}
            onClick={() => onFrameClick(f.value)}
          />
        ))}

        {/* 竖分隔线: 需给一个确定高度。组件默认的
            data-[orientation=vertical]:h-full 编译后为 .class[data-orientation] (特异性 0,2,0),
            会压过普通 h-10 (0,1,0); 而 height:100% 在 items-center + 高度未定的 flex
            父级下又解析为 auto → 塌陷成 0。用 v4 important 后缀 h-10! 强制 40px 确定高,
            再由父级 items-center 垂直居中。 */}
        <Separator orientation="vertical" className="h-10! mx-1" />
        {/* 右 · 相机层: 我在哪、看哪里 */}
        <div className="flex flex-col justify-center gap-0.5 ">
          <span className="text-[10px] tracking-[2px] text-sky-500/75">
            相机
          </span>
          {following && selected ? (
            <span className="text-[12px] text-sky-100 whitespace-nowrap glow-text">
              跟随 {selectionName(selected)}
            </span>
          ) : (
            <span className="text-[12px] text-sky-300/65 whitespace-nowrap">
              自由观察
            </span>
          )}
        </div>
        <Separator orientation="vertical" className="h-10! mx-1" />
        <HexActionButton
          icon={<Crosshair size={16} />}
          label="视角回中"
          title="注视点回到世界中心, 保持当前距离与方位 (回标准机位请再次点击当前坐标系)"
          onClick={requestRecenter}
        />
      </div>
    </div>
  );
}
