import { useState } from 'react';
import { useFrameStore, FRAME_INFO } from '@/store/frameStore';
import { useLocation } from 'react-router-dom';
import SceneOverlays from '@/components/layout/SceneOverlays';
import { TransitionGroup } from '@/components/common/transition';
import EventListPanel from './EventListPanel';
import EventContextPanel, { type EventContextView } from './EventContextPanel';
import { useEventCatalog } from './useEventCatalog';
import type { EventItem } from '@/services/eventCenter';

/**
 * 事件中心固定三列：左侧事件目录、中部三维态势、右侧统计/详情上下文。
 * 统计与目录共享 useEventCatalog 查询模型；选中事件只切换右侧内容，
 * 不改变中间场景宽度，避免连续浏览时布局跳动。
 * 三维场景由 App 层常驻。
 */
export default function EventsPage() {
  const frame = useFrameStore((s) => s.frame);
  const { pathname } = useLocation();
  const catalog = useEventCatalog();

  /* 列表选中事件后，右列切换到事件详情。
     列表行本身就是完整 DTO, 直接留存对象, 免去右列再打一次详情请求 */
  const [selected, setSelected] = useState<EventItem | null>(null);
  const [contextView, setContextView] = useState<EventContextView>('stats');
  const select = (event: EventItem) => {
    setSelected(event);
    setContextView('detail');
  };

  return (
    <div className="relative size-full overflow-hidden pointer-events-none">
      {/* 事件中心固定为“目录 / 三维态势 / 统计或详情”三列，避免选择事件时场景反复跳宽。 */}
      <div className="absolute inset-y-0 left-[var(--left-col-w)] right-[var(--right-col-w)] pointer-events-none">
        <SceneOverlays
          profile="event-center"
          caption={`${FRAME_INFO[frame].label} · 事件中心 · 全源汇聚`}
          captionTop={0}
          hintExtra="点击事件卡片在右侧查看简介"
        />
      </div>

      <div className="flex min-h-0 size-full pt-[10px]">
        {/* 左列: 事件列表 (检索 + 分页, 可滚动) */}
        <div
          className="w-[var(--left-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pl-2.5
            overflow-y-auto hud-scroll pointer-events-auto"
        >
          <TransitionGroup
            k={pathname}
            side="left"
            className="pointer-events-auto flex flex-col gap-2.5 h-full"
          >
            <EventListPanel
              model={catalog}
              selectedKey={selected?.key ?? null}
              onSelect={select}
            />
          </TransitionGroup>
        </div>

        {/* 中间区域: 定宽列之间的弹性占位 (浮层已提升至布局根层) */}
        <div className="relative min-w-0 flex-1 pointer-events-none" />

        {/* 右列默认统计，选中事件后切换详情；二者共享同一筛选结果。 */}
        <div className="w-[var(--right-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pr-2.5 pointer-events-auto">
          <TransitionGroup
            k={`event-context-${contextView}`}
            side="right"
            className="pointer-events-auto h-full"
          >
            <EventContextPanel
              model={catalog}
              selected={selected}
              view={contextView}
              onViewChange={setContextView}
              onSelect={select}
            />
          </TransitionGroup>
        </div>
      </div>
    </div>
  );
}
