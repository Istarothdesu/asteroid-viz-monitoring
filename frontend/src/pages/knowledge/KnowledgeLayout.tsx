import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, ArrowRight, ExternalLink } from "lucide-react";
import Panel from "@/components/ui/Panel";
import { TransitionGroup } from "@/components/common/transition";
import { cn } from "@/lib/utils";
import {
  KNOWLEDGE_ENTRIES,
  CATEGORY_LABELS,
  searchKnowledge,
  type KnowledgeCategory,
  type KnowledgeEntry,
} from "@/data/knowledge";

/**
 * 知识库页: 居中阅读单栏 (与技术指标页同版式)——
 * 头部为检索框 + 分类过滤, 下方为一条一行的结果列表 (面板自适应占满剩余视口,
 * 列表区内滚), 点击条目行就地展开正文; 条目行近不透明底色, 避免三维场景透视干扰。
 * 纯阅读页, 不挂载 SceneOverlays (时间轴/图例/工具条不渲染)。
 */

type CategoryFilter = KnowledgeCategory | "all";

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "全部" },
  ...(Object.entries(CATEGORY_LABELS) as [KnowledgeCategory, string][]).map(
    ([key, label]) => ({ key, label }),
  ),
];

/** 命中关键词高亮: 按空格分词在文本中包 mark 风格 span */
function highlight(text: string, query: string): ReactNode {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return text;
  const pattern = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(re);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-sky-400/25 text-sky-100 rounded-[2px] px-px">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function CategoryTag({ category }: { category: KnowledgeCategory }) {
  return (
    <span className="text-[10px] text-cyan-300/85 border border-cyan-400/25 rounded-sm px-1.5 py-px bg-cyan-400/5 whitespace-nowrap">
      {CATEGORY_LABELS[category]}
    </span>
  );
}

/** 条目行: 摘要态 / 选中后展开正文; 底色近不透明, 避免三维场景透视干扰阅读 */
function EntryCard({
  entry,
  query,
  expanded,
  onToggle,
}: {
  entry: KnowledgeEntry;
  query: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cardClass = cn(
    "rounded-sm border transition-all",
    expanded
      ? "border-sky-300/70 bg-[rgba(10,26,54,0.96)] shadow-[0_0_12px_rgba(125,211,252,0.25)]"
      : "border-sky-400/15 bg-[rgba(8,22,46,0.92)] hover:border-sky-400/45 hover:bg-[rgba(14,34,68,0.95)]",
  );

  return (
    <article className={cardClass}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="group flex w-full cursor-pointer flex-col gap-1.5 px-3 py-2.5 text-left"
      >
        <span className="flex items-center justify-between gap-2 w-full">
          <span className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "inline-block size-1.5 rotate-45 shrink-0 transition-all duration-300",
                expanded
                  ? "bg-sky-300 shadow-[0_0_6px_rgba(125,211,252,0.9)]"
                  : "bg-sky-500/70 group-hover:bg-sky-400",
              )}
            />
            <span className="text-[12px] font-bold text-sky-100/90 truncate">
              {highlight(entry.title, query)}
            </span>
          </span>
          <CategoryTag category={entry.category} />
        </span>
        <span className="text-[11px] leading-relaxed text-sky-100/60">
          {highlight(entry.summary, query)}
        </span>
      </button>
      {expanded && (
        <div className="mx-3 mb-2.5 flex flex-col gap-2.5 border-t border-sky-400/15 pt-2.5">
          {entry.body.map((para, i) => (
            <p key={i} className="text-[12px] leading-relaxed text-sky-100/80">
              {para}
            </p>
          ))}
          {entry.sources && entry.sources.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-sky-400/55">权威参考</span>
              {entry.sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-cyan-300/90 underline underline-offset-2 hover:text-cyan-100"
                >
                  {source.label}
                  <ExternalLink size={11} />
                </a>
              ))}
            </div>
          )}
          {entry.link && (
            <Link
              to={entry.link.to}
              className="mt-0.5 inline-flex w-fit items-center gap-1.5 text-[12px] text-cyan-300/90 border border-cyan-400/30 rounded-sm px-2.5 py-1 bg-cyan-400/5 hover:bg-cyan-400/15 hover:text-cyan-100 transition-all"
            >
              {entry.link.label}
              <ArrowRight size={12} />
            </Link>
          )}
        </div>
      )}
    </article>
  );
}

export default function KnowledgeLayout() {
  const { pathname } = useLocation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const results = useMemo(() => {
    const matched = searchKnowledge(query);
    return filter === "all"
      ? matched
      : matched.filter((e) => e.category === filter);
  }, [query, filter]);

  /* 选中项被检索/过滤排除时自动收起, 避免展开态与列表脱节 */
  const selected = results.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="relative size-full overflow-hidden pointer-events-none">
      <div className="flex min-h-0 size-full pt-[10px] pb-[50px] justify-center">
        <div className="w-[960px] max-w-[94vw] shrink pb-6 flex flex-col min-h-0">
          <TransitionGroup
            k={pathname}
            side="left"
            className="pointer-events-auto flex flex-col gap-2.5 flex-1 min-h-0"
          >
            {/* 头部: 标题 + 检索 + 分类过滤 */}
            <Panel
              className="shrink-0"
              title="知识库"
              extra={
                <span className="text-[10px] text-sky-400/60">
                  共 {KNOWLEDGE_ENTRIES.length} 条 · 空格分词, 支持中英文缩写
                </span>
              }
            >
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 border border-sky-400/25 rounded-sm bg-[rgba(8,20,42,0.6)] px-2.5 py-1.5 focus-within:border-sky-300/70 transition-colors">
                  <Search size={13} className="text-sky-400/70 shrink-0" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索知识: 如 PHA / B 平面 / 星等"
                    className="w-full bg-transparent text-[12px] text-sky-100 placeholder:text-sky-400/40 outline-none"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {CATEGORY_FILTERS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setFilter(c.key)}
                      className={cn(
                        "text-[11px] rounded-sm px-2 py-0.5 border transition-all cursor-pointer",
                        filter === c.key
                          ? "text-sky-100 border-sky-300/70 bg-sky-400/15 shadow-[0_0_8px_rgba(125,211,252,0.3)]"
                          : "text-sky-300/70 border-sky-400/20 bg-[rgba(8,20,42,0.4)] hover:text-sky-100 hover:border-sky-400/50",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                  <span className="ml-auto text-[10px] text-sky-400/50">
                    {results.length} 条结果
                  </span>
                </div>
              </div>
            </Panel>

            {/* 结果列表: 一条一行, 占满剩余视口高度, 列表区内滚 */}
            <Panel title="检索结果" className="flex-1 min-h-0" noPadding>
              {results.length === 0 ? (
                <div className="text-[12px] text-sky-400/60 text-center py-8 px-3">
                  没有匹配的知识条目, 换个关键词试试
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto hud-scroll flex flex-col gap-1.5 p-3">
                  {results.map((e) => (
                    <EntryCard
                      key={e.id}
                      entry={e}
                      query={query}
                      expanded={selected?.id === e.id}
                      onToggle={() =>
                        setSelectedId((cur) => (cur === e.id ? null : e.id))
                      }
                    />
                  ))}
                </div>
              )}
            </Panel>
          </TransitionGroup>
        </div>
      </div>
    </div>
  );
}
