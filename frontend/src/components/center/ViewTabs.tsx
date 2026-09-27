import { Orbit, RadioTower, Satellite } from 'lucide-react';
import { PrimaryNavLink } from '@/components/ui/PrimaryMenuButton';

const TABS = [
  { to: '/situation/overview', label: '小行星态势', icon: <Orbit size={13} /> },
  { to: '/situation/l1', label: 'L1星运行态势', icon: <Satellite size={13} /> },
  {
    to: '/situation/ground',
    label: '地面监测态势',
    icon: <RadioTower size={13} />,
  },
];

/** 悬浮于中央区域顶部居中的二级视图页签 (与一级菜单共用 PrimaryNavLink 原子) */
export default function ViewTabs() {
  return (
    <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex gap-1 w-max whitespace-nowrap">
      {TABS.map((t) => (
        <PrimaryNavLink key={t.to} to={t.to} icon={t.icon} label={t.label} />
      ))}
    </div>
  );
}
