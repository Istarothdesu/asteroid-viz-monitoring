import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useUIStore } from '@/store/uiStore';

/** 详情目标图像: 有现成贴图用贴图, 否则渐变色块占位 */
const TARGET_IMG: Record<string, string | undefined> = {
  太阳: '/image/8k_sun.jpg',
  水星: '/image/8k_mercury.jpg',
  金星: '/image/8k_venus_surface.jpg',
  地球: '/image/8k_earth_daymap.jpg',
  火星: '/image/8k_mars.jpg',
  木星: '/image/8k_jupiter.jpg',
  土星: '/image/8k_saturn.jpg',
  天王星: '/image/2k_uranus.jpg',
  海王星: '/image/2k_neptune.jpg',
  月球: '/image/8k_moon.jpg',
};

export function TargetImage({
  title,
  img,
  caption,
}: {
  title: string;
  img?: string;
  caption?: string;
}) {
  const src = img ?? TARGET_IMG[title] ?? '/image/4k_ceres_fictional.jpg';
  return (
    <div className="relative w-[104px] h-[104px] shrink-0 rounded-sm overflow-hidden border border-sky-400/25">
      {src ? (
        <img src={src} alt={title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-[radial-gradient(circle_at_35%_35%,rgba(125,211,252,0.35),rgba(3,10,25,0.9))]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[rgba(3,10,25,0.75)] via-transparent to-transparent" />
      {caption && (
        <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-[9px] text-sky-300/90 leading-tight">
          {caption}
        </div>
      )}
      <span className="absolute top-1 left-1 w-2 h-2 border-t border-l border-sky-300/80" />
      <span className="absolute bottom-1 right-1 w-2 h-2 border-b border-r border-sky-300/80" />
    </div>
  );
}

/** 列表面板内嵌搜索框 (原顶栏搜索下沉, 状态仍走 uiStore 全局共享) */
export function ListSearch({ placeholder }: { placeholder: string }) {
  const search = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  return (
    <div className="relative shrink-0 mb-1.5">
      <Search
        size={12}
        className="absolute top-1/2 left-2 -translate-y-1/2 text-sky-400/60"
      />
      <Input
        value={search}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={placeholder}
        className="pl-6 pr-2 text-xs bg-[rgba(8,20,42,0.6)]"
      />
    </div>
  );
}
