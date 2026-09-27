import { Orbit } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { useSimStore } from '@/store/simStore';
import { AU_KM } from '@/utils/orbital/constants';
import { fmtKm, fmtJD } from '@/utils/orbital/time';
import { LD_KM, useAsteroidDetail } from '@/features/asteroids/detail/AsteroidDetailContext';
import { KV, Tile } from '@/components/common/atoms';
import OrbitDiagram from './widgets/OrbitDiagram';

/** 右列: 轨道信息(示意图+接近事件) / 轨道六根数 / 物理特征 */
export default function AsteroidRightColumn() {
  const m = useAsteroidDetail();
  const setJD = useSimStore((s) => s.setJD);
  if (!m) return null;
  const { vm, analysis, massKg, massExp } = m;

  return (
    <>
      {/* 与地球轨道关系: 示意图 + MOID + 接近事件 */}
      <Panel title="轨道信息">
        <div className="flex flex-col gap-1.5 px-1 pb-1">
          <OrbitDiagram
            a={vm.el.a}
            e={vm.el.e}
            i={vm.el.i}
            w={vm.el.w}
            O={vm.el.O}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <Tile
              sym="Δ"
              v={analysis.moid.toFixed(4)}
              label="MOID AU"
              color="#fbbf24"
            />
            <Tile
              sym="T"
              v={analysis.periodYr.toFixed(2)}
              label="公转周期 年"
            />
          </div>
          <KV k="MOID 物理距离" v={fmtKm(analysis.moid * AU_KM)} />
          <KV k="轨道关系" v={analysis.relation.label} hl />
          <div className="border-t border-sky-400/15 pt-1.5">
            <div className="flex items-center gap-1.5 text-[10px] text-sky-200 mb-1">
              <Orbit size={11} className="text-sky-400" />
              前后 20 年接近事件{' '}
              <span className="text-sky-500/70">(点击行跳转时间轴)</span>
            </div>
            {analysis.approaches.length === 0 ? (
              <div className="text-[10px] text-sky-400/60 py-1.5 text-center">
                前后 20 年内无 0.5 AU 以内的接近事件
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {analysis.approaches.map((ap) => {
                  const past = ap.jd < analysis.baseJd;
                  return (
                    <button
                      key={ap.jd}
                      type="button"
                      onClick={() => setJD(ap.jd)}
                      className="w-full flex items-center justify-between gap-1 px-1.5 py-1 rounded-sm text-[10px] tabular-nums
                      border border-sky-400/15 bg-sky-400/[0.04] cursor-pointer transition-all
                      hover:border-amber-300/50 hover:bg-amber-400/10"
                      title="点击跳转时间轴至该时刻"
                    >
                      <span
                        className={`w-7 shrink-0 ${past ? 'text-sky-500/70' : 'text-emerald-400/90'}`}
                      >
                        {past ? '已过' : '未来'}
                      </span>
                      <span className="text-sky-200/90">
                        {fmtJD(ap.jd).slice(0, 10)}
                      </span>
                      <span className="text-amber-300/90">
                        {((ap.distAu * AU_KM) / LD_KM).toFixed(2)} LD
                      </span>
                      <span className="text-sky-400/80">
                        {ap.relSpeedKms.toFixed(1)} km/s
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Panel>

      {/* 轨道六根数: 3×3 符号瓦片 */}
      <Panel
        title="轨道六根数"
        extra={<span className="text-[9px] text-sky-400/60">J2000 历元</span>}
      >
        <div className="grid grid-cols-3 gap-1.5 px-1 pb-1">
          <Tile sym="a" v={vm.el.a.toFixed(3)} label="半长轴 AU" />
          <Tile sym="e" v={vm.el.e.toFixed(3)} label="偏心率" />
          <Tile sym="i" v={`${vm.el.i.toFixed(1)}°`} label="倾角" />
          <Tile sym="Ω" v={`${vm.el.O.toFixed(1)}°`} label="升交点" />
          <Tile sym="ω" v={`${vm.el.w.toFixed(1)}°`} label="近日点幅角" />
          <Tile sym="M₀" v={`${vm.el.M0.toFixed(1)}°`} label="平近点角" />
          <Tile
            sym="q"
            v={analysis.relation.q.toFixed(3)}
            label="近日点 AU"
            color="#fbbf24"
          />
          <Tile sym="Q" v={analysis.relation.Q.toFixed(3)} label="远日点 AU" />
          <Tile sym="T" v={analysis.periodYr.toFixed(2)} label="周期 年" />
        </div>
      </Panel>

      {/* 物理特征: 纯键值 */}
      <Panel title="物理特征">
        <div className="flex flex-col gap-1.5 px-1 pb-1">
          <KV
            k="直径"
            v={
              vm.diam >= 1
                ? `${vm.diam.toFixed(2)} km`
                : `${(vm.diam * 1000).toFixed(0)} m`
            }
            hl
          />
          <KV
            k="估算质量"
            v={
              <>
                {(massKg / 10 ** massExp).toFixed(2)} × 10<sup>{massExp}</sup>{' '}
                kg
              </>
            }
          />
          <KV
            k="自转周期"
            v={vm.spinH != null ? `${vm.spinH} 小时` : '暂无数据'}
          />
          <KV k="假设密度" v="3000 kg/m³ (石质)" />
        </div>
      </Panel>
    </>
  );
}
