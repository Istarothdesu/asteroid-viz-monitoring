import { useEffect, useState } from 'react';
import { Activity, Bell, BookOpen, Gauge, Maximize2, Minimize2 } from 'lucide-react';
import { PrimaryNavLink } from '@/components/ui/PrimaryMenuButton';
import { SevenSeg } from '@/components/ui/SevenSeg';
import GlobalSearch from '@/components/layout/GlobalSearch';
import { useBeijingClock } from '@/hooks/useBeijingClock';
import { useDataStore } from '@/store/dataStore';

/**
 * 顶栏 (flex 左中右三段式):
 * 左区 时钟+状态居左, 一级菜单"实时态势"居右贴靠中央;
 * 中区 定宽, 顶部流光为背景图 + 标题;
 * 右区 一级菜单"事件中心"居左贴靠中央, 其余功能按钮居右。
 * 中区宽度固定但允许收缩 (min-w 兜底), 两侧以内容宽度为收缩下限 (min-w-fit) ——
 * 窄屏时压缩量由中区吸收, 时钟/菜单/按钮不会被裁切。
 */
export default function TopBar() {
  const beijingStr = useBeijingClock();
  /* 事件中心角标: 三源全目录总数由服务端计数 (dataStore 首屏取一次,
     事件列表翻页与推演增删改会顺带刷新); 尚未取到时为 0, 角标不渲染 */
  const eventCount = useDataStore((s) => s.eventCounts?.all ?? 0);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen();
  };

  const fsBtnCls =
    'flex items-center justify-center w-7 h-7 rounded-sm text-sky-300/90 border border-sky-400/25 bg-[rgba(8,20,42,0.6)] hover:border-sky-300/70 hover:text-sky-100 hover:shadow-[0_0_10px_rgba(125,211,252,0.4)] transition-all cursor-pointer';

  return (
    <header className="relative h-[60px] shrink-0 pointer-events-none">
      <div className="relative z-10 flex h-full items-stretch gap-3 px-5">
        {/* 左区: 时钟+状态居左, 菜单居右 (贴靠中央标题区)
            min-w-fit: 以内容宽度为收缩下限, 窄屏时把压缩量让给中区而非裁字 */}
        <div className="pointer-events-auto flex min-w-fit flex-1 items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse-glow" />
            <SevenSeg
              value={beijingStr}
              size={15}
              ghost
              className="text-sky-200/90"
            />
            <span className="hidden sm:inline-block text-[10px] text-sky-400/70 whitespace-nowrap">
              北京时间
            </span>
            <span className="hidden lg:inline-block text-[11px] text-emerald-400/90 border border-emerald-400/30 rounded px-1.5 py-px bg-emerald-400/5 whitespace-nowrap">
              系统正常
            </span>
          </div>
          <PrimaryNavLink
            to="/situation/overview"
            icon={<Activity size={14} />}
            label="实时态势"
          />
        </div>

        {/* 中区: 定宽 (小屏可收缩), 流光作背景 + 标题 */}
        <div
          className="relative flex w-[800px] min-w-[300px] shrink items-top justify-center pt-4"
          style={{
            backgroundImage: 'url(/header/top-glow.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '100% 150%',
            backgroundPosition: 'center',
            filter:
              'drop-shadow(0 0 10px rgba(125,211,252,0.45)) brightness(1.05)',
          }}
        >
          <h1 className="title-gradient hidden md:block text-[16px] font-bold tracking-[3px] whitespace-nowrap leading-none">
            小行星动态展示
          </h1>
        </div>

        {/* 右区: 菜单居左 (贴靠中央标题区), 其余功能按钮居右 (min-w-fit 同左区) */}
        <div className="pointer-events-auto flex min-w-fit flex-1 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PrimaryNavLink
              to="/events"
              icon={<Bell size={14} />}
              label="事件中心"
              badge={eventCount}
            />
            <PrimaryNavLink
              to="/metrics"
              icon={<Gauge size={14} />}
              label="技术指标"
            />
            <PrimaryNavLink
              to="/knowledge"
              icon={<BookOpen size={14} />}
              label="知识库"
            />
          </div>
          <div className="flex items-center gap-2">
            <GlobalSearch />
            <button
              type="button"
              className={fsBtnCls}
              title={isFs ? '退出全屏' : '全屏'}
              onClick={toggleFullscreen}
            >
              {isFs ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
