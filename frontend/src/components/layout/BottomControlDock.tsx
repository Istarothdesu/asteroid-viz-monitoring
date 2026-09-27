import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import TimelineBar from '@/components/bottom/TimelineBar';
import FrameSwitcher from './FrameSwitcher';

/**
 * 底部控制坞：坐标系切换和时间导航由 Flex 自然堆叠。
 * TimelineBar 高度变化时会自动把 FrameSwitcher 向上推，不再依赖
 * bottom: calc(时间轴高度 + 手工偏移) 的两套绝对定位。
 */
export default function BottomControlDock({
  compact,
  upper,
  lower,
  lowerClassName,
}: {
  compact: boolean;
  /** 缺省为坐标系切换；事件过程仿真可注入观察视角切换。 */
  upper?: ReactNode;
  /** 缺省为日历时间轴；短时过程仿真可注入秒级时间轴。 */
  lower?: ReactNode;
  lowerClassName?: string;
}) {
  const dockRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const dock = dockRef.current;
    const timeline = timelineRef.current;
    if (!dock || !timeline) return;
    const root = document.documentElement;
    const updateLayout = () => {
      const height = Math.ceil(timeline.getBoundingClientRect().height);
      root.style.setProperty('--timeline-h', `${height + 16}px`);
      root.style.setProperty('--control-dock-h', `${Math.ceil(dock.getBoundingClientRect().height) + 16}px`);

      // 某些页面的覆盖层包含顶部导航高度，底边会超出视口。
      // 依据实际几何关系补偿，而不是写死一份 header 高度。
      const host = dock.offsetParent;
      const hostBottom = host
        ? host.getBoundingClientRect().bottom
        : window.innerHeight;
      const viewportOverflow = Math.max(0, hostBottom - window.innerHeight);
      dock.style.bottom = `${viewportOverflow + 8}px`;
    };
    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    observer.observe(dock);
    observer.observe(timeline);
    if (dock.offsetParent) observer.observe(dock.offsetParent);
    window.addEventListener('resize', updateLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateLayout);
      root.style.removeProperty('--timeline-h');
      root.style.removeProperty('--control-dock-h');
    };
  }, []);

  return (
    <div
      ref={dockRef}
      className={`absolute inset-x-0 bottom-2 z-20 flex flex-col items-center pointer-events-none ${
        compact ? 'gap-2' : 'gap-4'
      }`}
    >
      <div className="pointer-events-auto">
        {upper ?? <FrameSwitcher />}
      </div>
      <div
        ref={timelineRef}
        className={cn(
          'w-[72%] max-w-[1180px] min-w-[min(860px,100%)] pointer-events-auto',
          lowerClassName,
        )}
      >
        {lower ?? <TimelineBar />}
      </div>
    </div>
  );
}
