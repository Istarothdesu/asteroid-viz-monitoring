import { useNavigate } from 'react-router-dom';
import { Crosshair, Anchor, FileText, Orbit, ZoomIn } from 'lucide-react';
import Panel from '@/components/ui/Panel';
import { sceneRef } from '@/core/SceneManager';
import { Button } from '@/components/ui/button';
import RiskBadge from '@/components/common/RiskBadge';
import { useSelectionStore } from '@/store/selectionStore';
import { useCameraStore, useFollowing } from '@/store/cameraStore';
import { useFrameStore } from '@/store/frameStore';
import type { RiskLevel } from '@/services/statsService';
import { KVCell } from '@/components/common/atoms';
import { TargetImage } from './atoms';

/** 各类目标信息卡的统一数据形态 */
export interface TargetInfo {
  title: string;
  rows: [string, string][];
  desc: string;
  risk?: RiskLevel;
}

/**
 * 目标信息卡共享展示层: 标题/风险徽章 + 图像 + 键值网格 + 描述
 * + 聚焦跟随与专题详情按钮; 各领域信息卡 (小行星/监测站/天体/事件)
 * 仅负责推演 TargetInfo, 展示统一在此。
 */
export default function InfoCardView({ info }: { info: TargetInfo | null }) {
  const selected = useSelectionStore((s) => s.selected);
  const following = useFollowing();
  const navigate = useNavigate();

  /* 伴飞视角: 伴飞系的世界中心就是目标本身, 故先解除跟随再换帧,
     否则跟随逻辑会与"目标恒在原点"重复位移 */
  const enterComp = () => {
    if (selected?.kind !== 'ast') return;
    const fs = useFrameStore.getState();
    fs.setCompIdx(selected.idx);
    useCameraStore.getState().setFollowRequest(false);
    fs.setFrame('comp');
  };

  if (!info) return null;
  return (
    <Panel className="shrink-0" title="目标信息">
      <div className="px-2.5 pb-2.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="hud-title text-[14px] text-sky-50">
            {info.title}
          </span>
          {info.risk && (
            <span className="ml-auto">
              <RiskBadge level={info.risk} />
            </span>
          )}
        </div>

        <div className="flex gap-3">
          <TargetImage title={info.title} />
          <div className="flex-1 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] min-w-0 content-start">
            {info.rows.map(([k, v], i) => (
              <KVCell key={k} k={k} v={v} hl={i === 0} />
            ))}
          </div>
        </div>

        {info.desc && (
          <div className="mt-2 pt-2 border-t border-sky-400/15 text-[11px] leading-relaxed text-sky-300/85">
            {info.desc}
          </div>
        )}

        {/* 渲染时场景已挂载才提供近距观测 (sceneRef 由 3D 布局初始化) */}
        {sceneRef.current && (
          <div className="mt-2.5 flex gap-1.5">
            <Button
              variant="hudPrimary"
              onClick={() =>
                useCameraStore.getState().setFollowRequest(!following)
              }
              className="flex-1 tracking-[4px] text-[12px]"
            >
              {following ? (
                <>
                  <Anchor size={13} /> 停止跟随
                </>
              ) : (
                <>
                  <Crosshair size={13} /> 聚焦跟随
                </>
              )}
            </Button>
            <Button
              variant="hud"
              onClick={() => sceneRef.current?.zoomToSelection()}
              title="快速推近相机至目标近旁观测 (自动开启跟随, 手动拖拽/滚轮即中断)"
              className="flex-1 tracking-[2px] text-[12px]"
            >
              <ZoomIn size={13} /> 近距观测
            </Button>
          </div>
        )}
        {(selected?.kind === 'ast' ||
          selected?.kind === 'cloud' ||
          selected?.kind === 'station') && (
          <div className="mt-1.5 flex gap-1.5">
            {selected.kind === 'ast' && (
              <Button
                variant="hud"
                onClick={enterComp}
                title="切到伴飞坐标系, 以该小行星为世界中心观察"
                className="flex-1 tracking-[2px] text-[12px]"
              >
                <Orbit size={13} /> 伴飞视角
              </Button>
            )}
            <Button
              variant="hud"
              onClick={() =>
                navigate(
                  selected.kind === 'cloud'
                    ? `/asteroid/c:${selected.idx}`
                    : selected.kind === 'ast'
                      ? `/asteroid/${selected.idx}`
                      : `/station/${selected.idx}`,
                )
              }
              title={
                selected.kind === 'cloud'
                  ? '发起主动观测 · 进入专题推演'
                  : selected.kind === 'station'
                    ? '进入监测站专题详情页'
                    : '进入小行星专题页'
              }
              className="flex-1 tracking-[2px] text-[12px]"
            >
              <FileText size={13} /> 专题详情
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
