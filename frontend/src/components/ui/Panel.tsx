import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PanelProps {
  title?: string;
  /** 标题栏右侧附加内容 (操作按钮/说明文字) */
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  /** 内容区是否去掉默认内边距 */
  noPadding?: boolean;
}

/**
 * HUD 面板原子组件: 扫纹背景 + 顶部流光 + 四角高亮 + 标题栏底色带
 * (造型由 index.css 的 .hud-panel 类提供)。
 * 全站浮动面板统一使用此外壳。
 */
export default function Panel({
  title,
  extra,
  children,
  className,
  noPadding,
}: PanelProps) {
  return (
    <div
      className={cn(
        'hud-panel rounded-sm overflow-hidden flex flex-col',
        className,
      )}
    >
      <HudCorners />
      {title && (
        /* 标题栏底色带: 轻微提亮的横向渐变 + 底部分隔线 (对齐设计稿标题区块) */
        <div className="relative flex items-center justify-between px-3 py-2 shrink-0 bg-gradient-to-r from-sky-400/[0.12] via-sky-400/[0.04] to-transparent border-b border-sky-400/15">
          <div className="hud-title flex items-center gap-2">
            <span className="inline-block w-1 h-3.5 bg-gradient-to-b from-sky-300 to-sky-600 rounded-[1px] shadow-[0_0_6px_rgba(59,130,246,0.9)]" />
            {title}
          </div>
          {extra}
          <span className="absolute right-2.5 bottom-1.5 w-1 h-1 rounded-full bg-sky-400/70 animate-pulse-glow" />
        </div>
      )}
      <div
        className={cn(
          'flex-1 min-h-0 flex flex-col overflow-y-auto',
          noPadding ? '' : 'p-3',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** 四角高亮装饰 (非 Panel 容器需要角标时单独使用) */
export function HudCorners() {
  return (
    <>
      <span className="hud-corner tl" />
      <span className="hud-corner tr" />
      <span className="hud-corner bl" />
      <span className="hud-corner br" />
    </>
  );
}
