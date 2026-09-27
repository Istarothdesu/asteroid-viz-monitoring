import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Eye, Radio, Telescope } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { useStationDetail } from './StationDetailContext';
import { DetailPageHeader, KV } from '@/components/common/atoms';
import { DETAIL_BACK_BUTTON_CLASS } from '@/components/common/detailMeta';

/** 左列: 返回 + 页标题 / 观测站概况 / 望远镜与载荷 / 任务角色与贡献 / 实时观测状态  */
export default function StationLeftColumn() {
  const m = useStationDetail();
  const navigate = useNavigate();

  if (!m) {
    return (
      <Panel title="监测站详情">
        <div className="flex flex-col items-center gap-2.5 py-6">
          <div className="text-[12px] text-sky-300/80">未找到该监测站记录</div>
          <button
            type="button"
            className={DETAIL_BACK_BUTTON_CLASS}
            onClick={() => navigate('/situation/ground')}
          >
            <ChevronLeft size={13} /> 返回地面监测态势
          </button>
        </div>
      </Panel>
    );
  }

  const { st, spec, night, back } = m;

  return (
    <>
      {/* 返回按钮 + 页标题 */}
      <DetailPageHeader backLabel="地面监测态势" onBack={back} title="观测站详情" />

      {/* 观测站概况: 名称 + 标签 + 台址档案 + 简介 */}
      <Panel
        title="观测站概况"
        extra={
          <span
            className={
              night
                ? 'flex items-center gap-1 text-[9px] text-amber-300'
                : 'flex items-center gap-1 text-[9px] text-sky-400/70'
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${night ? 'bg-amber-400 animate-pulse' : 'bg-sky-400/50'}`}
            />
            {night ? '夜间观测中' : '白昼待命'}
          </span>
        }
      >
        <div className="px-1 pb-1">
          <div className="text-[14px] text-sky-50 leading-snug">{st.name}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {[st.country, st.type, spec?.network].filter(Boolean).map((t) => (
              <span
                key={t}
                className="text-[9px] px-1.5 py-0.5 rounded-sm border border-sky-400/30 bg-sky-400/10 text-sky-300"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="mt-1.5">
            <KV k="运营机构" v={spec?.operator} />
            <KV
              k="台址海拔"
              v={spec?.elevationM ? `${spec.elevationM} m` : undefined}
            />
            <KV
              k="地理坐标"
              v={`${Math.abs(st.lat).toFixed(2)}° ${st.lat >= 0 ? 'N' : 'S'}, ${Math.abs(st.lon).toFixed(2)}° ${st.lon >= 0 ? 'E' : 'W'}`}
            />
            <KV k="投入运行" v={spec?.commissioned} />
            <KV k="运行状态" v={spec?.status} />
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-sky-400/15 text-[10px] leading-relaxed text-sky-300/85">
            {st.desc}
          </div>
        </div>
      </Panel>

      {/* 望远镜与载荷: 设备规格档案 */}
      <Panel
        title="望远镜与载荷"
        extra={<Telescope size={12} className="text-sky-400/70" />}
      >
        <div className="px-1 pb-1">
          <KV k="主镜口径" v={spec?.aperture} />
          <KV k="视场" v={spec?.fov} />
          <KV k="极限星等" v={spec?.limitMag} />
          <KV k="探测器" v={spec?.detector} />
          <KV k="工作波段" v={spec?.band} />
          <KV k="曝光策略" v={spec?.exposure} />
          <KV k="巡天速度" v={spec?.surveyRate} />
          {!spec?.aperture && !spec?.fov && !spec?.limitMag && (
            <div className="text-[10px] text-sky-500/70 py-1">
              该站暂无公开设备规格档案。
            </div>
          )}
        </div>
      </Panel>

      {/* 任务角色与贡献: 定位 + 发现贡献 + 亮点成就 */}
      <Panel
        title="任务角色与贡献"
        extra={
          st.type === '行星雷达' ? (
            <Radio size={12} className="text-rose-300/80" />
          ) : (
            <Eye size={12} className="text-sky-400/70" />
          )
        }
      >
        <div className="px-1 pb-1">
          <KV k="任务定位" v={spec?.role} />
          <KV k="发现贡献" v={spec?.contribution} />
          {spec?.highlights && spec.highlights.length > 0 && (
            <div className="pt-1.5 border-t border-sky-400/15">
              <div className="text-[10px] text-sky-400/70 mb-1">亮点成就</div>
              <ul className="flex flex-col gap-1">
                {spec.highlights.map((h) => (
                  <li
                    key={h}
                    className="flex gap-1.5 text-[10px] text-sky-200/90 leading-relaxed"
                  >
                    <span className="text-emerald-400 shrink-0">◆</span>
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Panel>

      {/* 实时观测状态: 昼夜光锥 + 地方平时 + 三维呈现口径 */}
      <Panel title="实时观测状态">
        <div className="px-1 pb-1">
          <KV
            k="观测状态"
            v={night ? '夜间 · 观测光锥开启' : '白昼 · 观测光锥关闭'}
          />
          <KV k="地方平时 (按经度)" v={m.localTime} />
          <KV k="三维呈现" v="单站聚焦: 仅显示本站标记与视场光锥" />
        </div>
      </Panel>
    </>
  );
}
