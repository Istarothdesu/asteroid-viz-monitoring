import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Crosshair } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { KV } from '@/components/common/atoms';
import { useSimStore } from '@/store/simStore';
import { useFrameStore } from '@/store/frameStore';
import { fmtJDMinute, fmtKm } from '@/utils/orbital/time';
import {
  SEVERITY_META,
  SOURCE_META,
  CATEGORY_META,
  LD_KM,
  fmtEventDate,
  type EventItem,
} from '@/services/eventCenter';

/** 直径格式化: ≥1 km 保留两位, 否则按米取整 */
const fmtDiam = (km: number) =>
  km >= 1 ? `${km.toFixed(2)} km` : `${(km * 1000).toFixed(0)} m`;

/** 撞击能量格式化 */
const fmtEnergy = (mt: number) =>
  mt >= 1
    ? `${mt >= 10 ? mt.toFixed(0) : mt.toFixed(2)} Mt`
    : `${(mt * 1000).toFixed(1)} kt`;

/** 事件简介摘要: 内置/推演取服务端描述; CAD 由真实参数生成 (不虚构) */
function summaryOf(ev: EventItem): string {
  if (ev.desc) return ev.desc;
  if (ev.cad) {
    const c = ev.cad;
    return `JPL CAD 真实数据: ${fmtEventDate(ev.dateUTC, 'TDB')} 以约 ${(
      (ev.missKm ?? 0) / 1e6
    ).toFixed(2)} 百万公里 (${c.distLd.toFixed(2)} 个月球距离) 接近地球${
      ev.vRelKms ? `, 相对速度约 ${ev.vRelKms.toFixed(1)} km/s` : ''
    }。`;
  }
  return ev.type === 'impact'
    ? `直径约 ${fmtDiam(ev.diam)} 的天体撞击地球, 爆炸能量约 ${fmtEnergy(
        ev.energyMt ?? 0,
      )} TNT。`
    : `该天体将以约 ${((ev.missKm ?? 0) / LD_KM).toFixed(
        2,
      )} 个月球距离接近地球。`;
}

/**
 * 事件中心 · 右列事件简介: 列表选中后展示事件概要 (徽章/关键参数/摘要),
 * 「进入事件专题」跳转专题页, 「跳转事件时刻」定位时间轴观察交会几何。
 * 纯内容组件, 由 EventsPage 以左中右 Flex 结构的定宽右列承载。
 */
export default function EventIntroPanel({ ev }: { ev: EventItem }) {
  const navigate = useNavigate();
  const sev = SEVERITY_META[ev.severity];
  const src = SOURCE_META[ev.source];
  const summary = useMemo(() => summaryOf(ev), [ev]);

  /* 跳转事件时刻: 日心系取景 + 时间轴定位发现时刻并播放 */
  const jumpToEvent = () => {
    useFrameStore.getState().setFrame('helio');
    useSimStore.getState().setJD(ev.jdEnc - ev.leadH / 24);
    useSimStore.getState().setPlaying(true);
  };

  return (
    <>
      {/* 事件简介 */}
      <Panel
        title="事件简介"
        extra={
          <span
            className="text-[10px] tabular-nums px-1.5 rounded-sm border"
            style={{
              color: sev.color,
              borderColor: `${sev.color}66`,
              background: `${sev.color}1a`,
            }}
          >
            {sev.label}
          </span>
        }
      >
        <div className="flex flex-col gap-1.5 px-1 pb-1">
          <div className="text-[12px] text-sky-100 leading-snug">
            {ev.name}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[9px] px-1 py-px rounded-sm border ${
                ev.type === 'impact'
                  ? 'text-red-300 border-red-400/35 bg-red-400/10'
                  : 'text-sky-300 border-sky-400/30 bg-sky-400/[0.06]'
              }`}
            >
              {ev.type === 'impact' ? '撞击' : '飞掠'}
            </span>
            <span
              className={`text-[9px] px-1 py-px rounded-sm border ${src.cls}`}
            >
              {src.label}
            </span>
            <span className="text-[9px] px-1 py-px rounded-sm border text-sky-400/80 border-sky-400/20 bg-sky-400/[0.05]">
              {CATEGORY_META[ev.category].label}
            </span>
          </div>

          <KV k="风险目标" v={ev.target} hl />
          <KV k="遭遇时刻" v={fmtEventDate(ev.dateUTC, ev.source === 'cad' ? 'TDB' : 'UTC')} hl />
          <KV k="发现时刻" v={fmtJDMinute(ev.jdEnc - ev.leadH / 24)} />
          <KV
            k="天体直径"
            v={
              <>
                {fmtDiam(ev.diam)}
                {ev.diamEstimated && (
                  <span className="text-sky-500/70"> (估算)</span>
                )}
              </>
            }
          />
          {ev.type === 'flyby' ? (
            <>
              <KV
                k="最近接近距离"
                v={`${fmtKm(ev.missKm ?? 0)} (${(
                  (ev.missKm ?? 0) / LD_KM
                ).toFixed(2)} LD)`}
              />
              {ev.vRelKms != null && (
                <KV k="相对速度" v={`${ev.vRelKms.toFixed(1)} km/s`} />
              )}
            </>
          ) : (
            <KV k="撞击能量当量" v={`${fmtEnergy(ev.energyMt ?? 0)} TNT`} />
          )}

          <div className="pt-1.5 border-t border-sky-400/15 text-[10px] text-sky-200/90 leading-relaxed">
            {summary}
          </div>
        </div>
      </Panel>

      {/* 操作按钮: 进入专题 / 跳转事件时刻 */}
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => navigate(`/events/${ev.key}`)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm
            text-[12px] tracking-[1px] text-sky-50 border cursor-pointer transition-all whitespace-nowrap"
          style={{
            background: `linear-gradient(90deg, ${sev.color}cc, ${sev.color}99)`,
            borderColor: `${sev.color}66`,
          }}
        >
          <ArrowRight size={13} /> 进入事件专题
        </button>
        <button
          type="button"
          onClick={jumpToEvent}
          title="时间轴定位到发现时刻并播放"
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm
            text-[12px] tracking-[1px] hud-btn text-sky-200 border border-sky-400/35
            hover:border-sky-300/70 cursor-pointer transition-all whitespace-nowrap"
        >
          <Crosshair size={13} /> 跳转事件时刻
        </button>
      </div>
    </>
  );
}
