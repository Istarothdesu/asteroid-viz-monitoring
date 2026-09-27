import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

/**
 * 全局检索入口 (顶栏按钮): 跳转独立检索路由 /search
 * (左列搜索框+结果列表, 右列结果详情与专题入口, 支持浏览器回退)。
 * ⌘/Ctrl+K 全局快捷键同样直达。
 */
export default function GlobalSearch() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        navigate('/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <button
      type="button"
      className="flex items-center justify-center w-7 h-7 rounded-sm text-sky-300/90 border border-sky-400/25 bg-[rgba(8,20,42,0.6)] hover:border-sky-300/70 hover:text-sky-100 hover:shadow-[0_0_10px_rgba(125,211,252,0.4)] transition-all cursor-pointer"
      title="全局检索 (⌘/Ctrl+K)"
      onClick={() => navigate('/search')}
    >
      <Search size={14} />
    </button>
  );
}
