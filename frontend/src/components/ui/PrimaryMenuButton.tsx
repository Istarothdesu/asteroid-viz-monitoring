import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface PrimaryMenuButtonProps {
  icon?: ReactNode;
  label: string;
  active?: boolean;
  /** 红色角标 (>99 显示 99+) */
  badge?: number;
  title?: string;
  className?: string;
  onClick?: () => void;
}

/** 一级/二级菜单按钮基础样式 (button 与 NavLink 两种容器共用)。
 *  背景统一由 .hud-btn / .hud-btn-on 提供 (hud-panel 同款扫描纹理 + 毛玻璃) */
function primaryMenuCls(active: boolean, className?: string) {
  return cn(
    'hud-btn relative px-5 py-1.5 text-[13px] tracking-[3px] transition-all duration-300 skew-x-[-12deg] cursor-pointer',
    'focus-visible:outline-none focus-visible:border-sky-300/80 focus-visible:shadow-[0_0_14px_rgba(125,211,252,0.45)]',
    active
      ? 'hud-btn-on text-sky-100 border border-sky-400/50 shadow-[0_0_14px_rgba(125,211,252,0.35)]'
      : 'text-sky-300/85 border border-sky-400/20 hover:text-sky-100 hover:border-sky-400/50',
    className,
  );
}

/** 红色脉冲角标 (>99 显示 99+) */
function Badge({ value }: { value: number }) {
  return (
    <span className="min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-500 text-[9px] text-white flex items-center justify-center shadow-[0_0_6px_rgba(239,68,68,0.9)] animate-pulse-glow">
      {value > 99 ? '99+' : value}
    </span>
  );
}

/** 按钮内容: 图标 + 文字 + 角标，选中态追加放射光效 */
function MenuInner({
  icon,
  label,
  badge,
  active,
}: {
  icon?: ReactNode;
  label: string;
  badge?: number;
  active: boolean;
}) {
  return (
    <>
      <span className="inline-flex items-center gap-1.5 skew-x-[12deg]">
        {icon}
        {label}
        {badge != null && badge > 0 && <Badge value={badge} />}
      </span>
      {active && <ActiveRay />}
    </>
  );
}

/**
 * 一级菜单按钮原子组件: 斜切平行四边形, 选中态渐变发光 +
 * 底部"中心亮点向两侧发散"放射光线 (ray-grow)。
 * 外层标签由调用方决定 (button 或 NavLink 透传 className)。
 */
export default function PrimaryMenuButton({
  icon,
  label,
  active = false,
  badge,
  title,
  className,
  onClick,
}: PrimaryMenuButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={primaryMenuCls(active, className)}
    >
      <MenuInner icon={icon} label={label} badge={badge} active={active} />
    </button>
  );
}

/**
 * 路由版菜单按钮原子组件: 与 PrimaryMenuButton 同一套样式，
 * 仅容器换为 react-router 的 NavLink。TopBar 一级菜单与
 * ViewTabs 二级页签统一使用本组件。
 */
export function PrimaryNavLink({
  to,
  icon,
  label,
  badge,
  className,
}: {
  to: string;
  icon?: ReactNode;
  label: string;
  badge?: number;
  className?: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => primaryMenuCls(isActive, className)}
    >
      {({ isActive }) => (
        <MenuInner icon={icon} label={label} badge={badge} active={isActive} />
      )}
    </NavLink>
  );
}

/** 选中态底部放射光效: 光带 + 中心光源点 (供其他选中态元素复用) */
export function ActiveRay() {
  return (
    <>
      {/* 放射光带: 中心最亮向两侧渐隐发散 */}
      <span className="animate-ray-grow absolute -bottom-[2px] left-1/2 h-[3px] w-[115%] bg-[radial-gradient(ellipse_50%_100%_at_50%_50%,rgba(255,255,255,0.95)_0%,rgba(125,211,252,0.85)_30%,rgba(56,189,248,0.25)_65%,transparent_100%)] drop-shadow-[0_0_6px_rgba(125,211,252,0.9)]" />
      {/* 中心光源点 + 多层光晕 */}
      <span className="absolute -bottom-[3px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_4px_#fff,0_0_10px_#7dd3fc,0_0_18px_rgba(56,189,248,0.7)]" />
    </>
  );
}
