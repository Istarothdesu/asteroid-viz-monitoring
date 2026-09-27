import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { useFrameStore, FRAME_INFO } from '@/store/frameStore';
import { useEventSimulationStore } from '@/store/eventSimulationStore';
import { useSimEventStore } from '@/store/simEventStore';
import SceneOverlays from '@/components/layout/SceneOverlays';
import { TransitionGroup } from '@/components/common/transition';
import Panel from '@/components/ui/Panel';
import { Button } from '@/components/ui/button';
import { DetailPageHeader } from '@/components/common/atoms';
import SimEventForm from '@/features/events/simulation/form/SimEventForm';
import type { SimEventFormData } from '@/features/events/simulation/types';
import {
  EMPTY_SIM_EVENT_FORM,
  buildSimEventRecord,
  toSimEventInput,
  validateSimEvent,
} from '@/features/events/simulation/model';
import { useSimEventPreview } from '@/features/events/simulation/useSimEventPreview';
import SimEventPreviewPanels from '@/features/events/simulation/SimEventPreviewPanels';

/**
 * 新建推演事件页 (左中右弹性结构, 参考 AsteroidLayout / ObsTaskLayout):
 * 左列 = 返回栏 + 分组表单 (基本信息 / 轨道信息 / 飞掠·撞击信息) + 操作按钮;
 * 中间 = 常驻三维场景, 表单参数变化时实时拟合并绘制目标天体与轨道;
 * 右列 = 参数预览 (KV 原子) + 推演就绪状态。
 * 仿真 (推演) 激活时隐藏左右列让出中央视野, 与事件专题页一致。
 */

export default function CreateSimEventLayout() {
  const navigate = useNavigate();
  const frame = useFrameStore((s) => s.frame);
  const add = useSimEventStore((s) => s.add);
  const saving = useSimEventStore((s) => s.saving);
  const startSimulation = useEventSimulationStore((s) => s.startSimulation);
  /* 推演 (仿真) 激活时隐藏左右列, 让出中央视野 —— 与事件专题页一致 */
  const replayOn = useEventSimulationStore((s) => !!s.activeEvent);

  const [formData, setFormData] = useState<SimEventFormData>(EMPTY_SIM_EVENT_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useSimEventPreview(formData, replayOn);

  /* 表单变化即清除上一次的校验提示, 避免过期错误滞留 */
  const handleChange = (d: SimEventFormData) => {
    setFormData(d);
    setNotice(null);
  };

  const handleReplay = () => {
    const errs = validateSimEvent(formData);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setNotice('推演前请先补全标红的必填项');
      return;
    }
    startSimulation(buildSimEventRecord(`sim-${Date.now()}`, formData));
  };

  const handleSave = async () => {
    const errs = validateSimEvent(formData);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setNotice('保存前请先补全标红的必填项');
      return;
    }
    /* 推演事件已入库共享: 写入失败就留在本页, 避免表单白填 */
    try {
      await add(toSimEventInput(formData));
    } catch {
      setNotice('保存失败, 后端不可达或参数不合法');
      return;
    }
    navigate('/events');
  };

  return (
    <div className="flex size-full flex-col overflow-hidden pointer-events-none">
      <div className="flex min-h-0 flex-1 pt-[10px]">
        {/* 左列: 返回栏 + 分组表单 + 操作按钮 (仿真激活时隐藏让出视野) */}
        {!replayOn && (
          <div
            className="w-[var(--left-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pl-2.5
              overflow-y-auto hud-scroll pointer-events-auto flex flex-col gap-2.5"
          >
            <TransitionGroup
              k="create-sim-left"
              side="left"
              className="pointer-events-auto flex flex-col gap-2.5 h-full"
            >
              <DetailPageHeader
                backLabel="返回事件中心"
                onBack={() => navigate('/events')}
                title="新建推演事件"
              />

              <Panel title="推演参数">
                <SimEventForm
                  data={formData}
                  onChange={handleChange}
                  errors={errors}
                />
              </Panel>

              {notice && (
                <div className="flex items-start gap-1.5 rounded-sm border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                  <TriangleAlert size={13} className="mt-px shrink-0" />
                  <span>{notice}</span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="hudPrimary"
                  className="w-full tracking-[3px] text-[12px]"
                  onClick={handleReplay}
                >
                  推演 (回放)
                </Button>
                <Button
                  type="button"
                  variant="hud"
                  className="w-full tracking-[3px] text-[12px]"
                  disabled={saving}
                  onClick={handleSave}
                >
                  {saving ? '保存中…' : '保存事件'}
                </Button>
              </div>
            </TransitionGroup>
          </div>
        )}

        {/* 中间区域: 常驻三维场景 + 全部场景浮层 */}
        <div className="relative min-w-0 flex-1 pointer-events-none">
          <SceneOverlays
            profile="event-create"
            showClock={false}
            caption={`${FRAME_INFO[frame].label} · 新建推演事件`}
            hintExtra="调整参数实时预览天体轨道"
          />
        </div>

        {/* 右列: 参数预览 + 推演就绪状态 (仿真激活时隐藏让出视野) */}
        {!replayOn && (
          <div
            className="w-[var(--right-col-w)] shrink-0 pb-[calc(var(--timeline-h)+8px)] pr-2.5
              overflow-y-auto hud-scroll pointer-events-auto flex flex-col gap-2.5"
          >
            <TransitionGroup
              k="create-sim-right"
              side="right"
              className="pointer-events-auto flex flex-col gap-2.5 h-full"
            >
              <SimEventPreviewPanels data={formData} />
            </TransitionGroup>
          </div>
        )}
      </div>
    </div>
  );
}
