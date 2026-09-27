import type { RiskLevel } from '@/services/statsService';

/* 风险等级 → 五级刻度位置 (正常/低/中/高 → 0..3, 第 5 格为"撞击确认"预留) */
const RISK_LEVELS: {
  key: RiskLevel | 'impact';
  label: string;
  color: string;
}[] = [
  { key: 'normal', label: '正常', color: '#69f0ae' },
  { key: 'low', label: '低', color: '#f5e642' },
  { key: 'medium', label: '中', color: '#ff7043' },
  { key: 'high', label: '高', color: '#ff4d4f' },
  { key: 'impact', label: '撞击', color: '#d50000' },
];

/** 五级风险刻度尺: 当前等级发光段 + 其余暗段 */
export default function RiskScale({ level }: { level: RiskLevel }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-[3px]">
        {RISK_LEVELS.map((seg) => {
          const active = seg.key === level;
          return (
            <div
              key={seg.key}
              className="h-[7px] flex-1 rounded-[2px]"
              style={
                active
                  ? { background: seg.color, boxShadow: `0 0 8px ${seg.color}` }
                  : { background: 'rgba(148,163,184,0.14)' }
              }
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[8px] text-sky-500/60">
        {RISK_LEVELS.map((seg) => (
          <span
            key={seg.key}
            style={seg.key === level ? { color: seg.color } : undefined}
          >
            {seg.label}
          </span>
        ))}
      </div>
    </div>
  );
}
