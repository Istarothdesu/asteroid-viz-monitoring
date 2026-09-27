import Panel from '@/components/ui/Panel';
import { useEventSimulationStore } from '@/store/eventSimulationStore';

/**
 * 仿真信息面板: 仿真激活时展示事件图文与媒体报道 (无仿真时不渲染)。
 */
export default function ReplayPanel() {
  const activeEvent = useEventSimulationStore((s) => s.activeEvent);
  if (!activeEvent) return null;
  return (
    <Panel className="shrink-0 max-h-[340px]" title="仿真信息">
      <div className="overflow-y-auto hud-scroll px-2 pb-2">
        <div className="text-[12px] text-sky-100 font-semibold mb-1.5">
          事件仿真: {activeEvent.name}
        </div>
        {activeEvent.img && (
          <img
            src={activeEvent.img}
            alt={activeEvent.name}
            className="w-full rounded-sm border border-sky-400/20 mb-1"
          />
        )}
        {activeEvent.credit && (
          <div className="text-[9px] text-sky-500/70 mb-1">
            {activeEvent.credit}
          </div>
        )}
        <div className="text-[11px] leading-relaxed text-sky-300/85">
          {activeEvent.desc}
        </div>
        {activeEvent.news && (
          <div className="mt-1.5 p-2 rounded-sm bg-sky-400/[0.06] border border-sky-400/15 text-[10px] leading-relaxed text-sky-400/90">
            {activeEvent.news}
          </div>
        )}
      </div>
    </Panel>
  );
}
