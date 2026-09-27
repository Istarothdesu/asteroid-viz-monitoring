import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * 分页 (shadcn 结构 + 本项目 HUD 皮肤):
 * 组件划分与导出名沿用 shadcn/ui pagination (Pagination / Content / Item /
 * Link / Previous / Next / Ellipsis), 便于按官方模式组合。
 *
 * 与官方差异 (owned-copy 定制):
 * - PaginationLink 渲染为 <button type="button"> 而非 <a> —— 本项目列表翻页走
 *   React state (setPage) 而非 URL 导航, button 天然可聚焦/键盘可达, 免去
 *   href="#" + preventDefault 的 hack;
 * - 视觉与 EventListPanel 分类页签同源: 深色底 + 细边框, 选中态青蓝辉光, 紧凑 h-6。
 */
function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn('flex w-full justify-center', className)}
      {...props}
    />
  );
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<'ul'>) {
  return (
    <ul
      className={cn('flex flex-row items-center gap-1', className)}
      {...props}
    />
  );
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li {...props} />;
}

function PaginationLink({
  className,
  isActive,
  ...props
}: React.ComponentProps<'button'> & { isActive?: boolean }) {
  return (
    <button
      type="button"
      aria-current={isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        'inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-sm border px-1.5 text-[11px] tabular-nums transition-all',
        'disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-sky-400/20 disabled:hover:text-sky-300/80',
        isActive
          ? 'border-sky-400/60 bg-sky-400/15 text-sky-100 shadow-[0_0_8px_rgba(125,211,252,0.25)]'
          : 'border-sky-400/20 text-sky-300/80 hover:border-sky-300/60 hover:text-sky-100',
        className,
      )}
      {...props}
    />
  );
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="上一页"
      className={cn('px-1', className)}
      {...props}
    >
      <ChevronLeft size={13} />
    </PaginationLink>
  );
}

function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) {
  return (
    <PaginationLink
      aria-label="下一页"
      className={cn('px-1', className)}
      {...props}
    >
      <ChevronRight size={13} />
    </PaginationLink>
  );
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        'flex h-6 w-5 items-center justify-center text-sky-400/50',
        className,
      )}
      {...props}
    >
      <MoreHorizontal size={14} />
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
