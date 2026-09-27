import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { SlideSide } from './SlidePanel';

interface TransitionGroupProps {
  /** 切换标识 (如路由 pathname 或 mode); 变化时旧内容退场、新内容入场 */
  k: string;
  side?: SlideSide;
  duration?: number;
  className?: string;
  children: ReactNode;
}

/**
 * 内容切换过渡容器 (顺序式):
 * k 变化时先以旧内容快照播放退场动画, duration 结束后挂载新内容播放入场动画。
 * 快速连续切换时始终以最新一次为准, 不会产生面板残留。
 * 典型用法: 路由 Outlet 包装、右侧面板随 mode 切换。
 */
export default function TransitionGroup({
  k,
  side = 'left',
  duration = 800,
  className,
  children,
}: TransitionGroupProps) {
  const [leaving, setLeaving] = useState<{ k: string; node: ReactNode } | null>(
    null,
  );
  const prevK = useRef(k);
  const prevNode = useRef(children);

  if (prevK.current !== k) {
    /* k 变化: 渲染期将旧内容转入退场快照 (React 合法的同组件渲染期更新) */
    setLeaving({ k: prevK.current, node: prevNode.current });
    prevK.current = k;
  }
  prevNode.current = children;

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), duration);
    return () => clearTimeout(t);
  }, [leaving, duration]);

  if (leaving) {
    return (
      <div
        key={`leave-${leaving.k}`}
        className={cn(`anim-slide-${side}-leave`, className)}
        style={{ animationDuration: `${duration}ms` }}
      >
        {leaving.node}
      </div>
    );
  }
  return (
    <div
      key={`enter-${k}`}
      className={cn(`anim-slide-${side}-enter`, className)}
      style={{ animationDuration: `${duration}ms` }}
    >
      {children}
    </div>
  );
}
