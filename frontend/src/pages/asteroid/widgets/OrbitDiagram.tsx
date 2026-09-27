import { useState } from 'react';
import type { ReactNode } from 'react';

const D2R = Math.PI / 180;

/* ---------- 轨道示意图: 俯视 (黄道面投影) / 侧视 (沿黄道面看, 真实倾角) ---------- */

function OrbitSvg({
  a,
  e,
  i,
  w,
  O,
  view,
}: {
  a: number;
  e: number;
  i: number;
  w: number;
  O: number;
  view: 'top' | 'side';
}) {
  const b = a * Math.sqrt(Math.max(1 - e * e, 1e-6));
  const R = Math.max(a * (1 + e), 1);
  const s = 50 / (R * 1.12);
  const ci = Math.cos((i ?? 0) * D2R);
  const si = Math.sin((i ?? 0) * D2R);

  let orbit: ReactNode;
  if (view === 'top') {
    orbit = (
      <g transform={`rotate(${-(O ?? 0)})`}>
        <ellipse
          cx={-a * e * s}
          cy={0}
          rx={a * s}
          ry={b * s}
          fill="none"
          stroke="rgba(255,183,77,0.9)"
          strokeWidth={1.2}
        />
      </g>
    );
  } else {
    /* 侧视: 轨道面内采样点, 经 ω 旋转后按倾角 i 投影到 (ξ, ζ) 平面;
       ξ 轴与地球轨道共面 (画面左右), ζ 为垂直黄道高度 (画面上下) */
    const cw = Math.cos((w ?? 0) * D2R);
    const sw = Math.sin((w ?? 0) * D2R);
    const pts: string[] = [];
    for (let k = 0; k <= 128; k++) {
      const th = (k / 128) * 2 * Math.PI;
      const r = (a * (1 - e * e)) / (1 + e * Math.cos(th));
      const u = r * Math.cos(th),
        v = r * Math.sin(th);
      const xi = cw * u - sw * v;
      const yi = sw * u + cw * v;
      pts.push(`${(xi * s).toFixed(2)},${(-yi * si * s).toFixed(2)}`);
    }
    orbit = (
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="rgba(255,183,77,0.9)"
        strokeWidth={1.2}
      />
    );
  }

  return (
    <svg viewBox="-62 -62 124 124" className="w-full h-[148px]">
      {view === 'top' ? (
        <>
          <circle
            cx={0}
            cy={0}
            r={1 * s}
            fill="none"
            stroke="rgba(56,189,248,0.55)"
            strokeWidth={1}
          />
          <circle cx={1 * s} cy={0} r={2.8} fill="#38bdf8" />
          <text
            x={1 * s + 5}
            y={3.5}
            fontSize={7}
            fill="rgba(125,211,252,0.85)"
          >
            地球轨道
          </text>
        </>
      ) : (
        <>
          {/* 黄道面 (画面中轴) 与地球轨道侧缘 */}
          <line
            x1={-58}
            y1={0}
            x2={58}
            y2={0}
            stroke="rgba(56,189,248,0.3)"
            strokeWidth={0.8}
            strokeDasharray="3 3"
          />
          <line
            x1={-1 * s}
            y1={0}
            x2={1 * s}
            y2={0}
            stroke="rgba(56,189,248,0.85)"
            strokeWidth={1.4}
          />
          <circle cx={-1 * s} cy={0} r={2.4} fill="#38bdf8" />
          <circle cx={1 * s} cy={0} r={2.4} fill="#38bdf8" />
          <text
            x={1 * s + 4}
            y={-3}
            fontSize={6.5}
            fill="rgba(125,211,252,0.85)"
          >
            地球轨道侧缘 (黄道面)
          </text>
          {ci < 0.999 && (
            <text
              x={34}
              y={-26 * si - 3}
              fontSize={6.5}
              fill="rgba(255,183,77,0.85)"
            >
              ↑ 高出黄道面
            </text>
          )}
        </>
      )}
      {orbit}
      <circle cx={0} cy={0} r={3.2} fill="#fbbf24" />
      <circle
        cx={0}
        cy={0}
        r={6}
        fill="none"
        stroke="rgba(251,191,36,0.4)"
        strokeWidth={1}
      />
    </svg>
  );
}

/** 轨道关系示意图: 太阳焦点 + 地球轨道圆 + 小行星椭圆, 俯视/侧视切换 */
export default function OrbitDiagram({
  a,
  e,
  i = 0,
  w = 0,
  O = 0,
}: {
  a: number;
  e: number;
  i?: number;
  w?: number;
  O?: number;
}) {
  const [view, setView] = useState<'top' | 'side'>('top');
  const q = a * (1 - e);
  const Q = a * (1 + e);
  return (
    <div className="rounded-sm border border-sky-400/15 bg-[rgba(5,12,28,0.5)] overflow-hidden">
      <div className="flex border-b border-sky-400/10">
        {(['top', 'side'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`flex-1 text-[10px] py-1 transition-colors ${
              view === v
                ? 'text-sky-200 bg-sky-400/10 border-b border-sky-300/70'
                : 'text-sky-400/60 hover:text-sky-300'
            }`}
          >
            {v === 'top' ? '俯视图' : '侧视图'}
          </button>
        ))}
      </div>
      <OrbitSvg a={a} e={e} i={i} w={w} O={O} view={view} />
      <div className="text-[9px] text-sky-500/70 text-center pb-1 -mt-1">
        {view === 'top'
          ? `黄道面俯视示意 · q ${q.toFixed(2)} / Q ${Q.toFixed(2)} AU`
          : `沿黄道面侧视 · 轨道倾角 ${i.toFixed(1)}°`}
      </div>
    </div>
  );
}
