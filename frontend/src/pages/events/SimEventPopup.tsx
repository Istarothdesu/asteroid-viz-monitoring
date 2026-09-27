import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSimEventStore, type SimEvent } from '@/store/simEventStore'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import SimEventForm from '@/features/events/simulation/form/SimEventForm'
import type { SimEventFormData } from '@/features/events/simulation/types'
import {
  EMPTY_SIM_EVENT_FORM,
  buildSimEventRecord,
  toSimEventFormData,
  toSimEventInput,
  validateSimEvent,
} from '@/features/events/simulation/model'

interface EditableEvent {
  id: string | null
  form: SimEventFormData
}

function SimEventDialog({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: EditableEvent
  saving: boolean
  onSave: (event: EditableEvent) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState(initial.form)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSave = async () => {
    const nextErrors = validateSimEvent(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    await onSave({ id: initial.id, form })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel() }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{initial.id ? '编辑预警事件' : '新建预警事件'}</DialogTitle>
        </DialogHeader>
        <SimEventForm
          data={form}
          errors={errors}
          onChange={(next) => {
            setForm(next)
            if (Object.keys(errors).length > 0) setErrors({})
          }}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="hud"
            className="px-4 text-[12px]"
            disabled={saving}
            onClick={onCancel}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="hudPrimary"
            className="w-auto px-5 text-[12px] tracking-[2px]"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? '保存中…' : '保存事件'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const OPERATION_BUTTON_CLASS = cn(
  'rounded-sm border border-sky-400/25 px-2 py-0.5 text-[11px] text-sky-300/90 transition-all cursor-pointer',
  'hover:border-sky-300/70 hover:text-sky-100 hover:shadow-[0_0_6px_rgba(125,211,252,0.35)]',
)

function editableEvent(event?: SimEvent): EditableEvent {
  if (!event) {
    return { id: null, form: { ...EMPTY_SIM_EVENT_FORM, el: { ...EMPTY_SIM_EVENT_FORM.el } } }
  }
  const { id, ...input } = event
  return { id, form: toSimEventFormData(input) }
}

/** 预警事件仿真弹窗内容：列表、编辑和回放共用模拟事件领域模型。 */
export default function SimEventPopup({ onClose }: { onClose: () => void }) {
  const events = useSimEventStore((state) => state.events)
  const saving = useSimEventStore((state) => state.saving)
  const add = useSimEventStore((state) => state.add)
  const update = useSimEventStore((state) => state.update)
  const remove = useSimEventStore((state) => state.remove)
  const startSimulation = useEventSimulationStore((state) => state.startSimulation)
  const [editing, setEditing] = useState<EditableEvent | null>(null)

  const saveEvent = async ({ id, form }: EditableEvent) => {
    const input = toSimEventInput(form)
    try {
      if (id) await update({ id, ...input })
      else await add(input)
      setEditing(null)
    } catch {
      alert('保存失败, 后端不可达或参数不合法')
    }
  }

  return (
    <>
      <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto pr-1">
        {events.length === 0 && (
          <div className="py-3 text-center text-[12px] text-sky-500/80">暂无仿真事件</div>
        )}
        {events.map((event) => (
          <div
            key={event.id}
            className="rounded-sm border border-sky-400/15 bg-sky-500/[0.04] px-2.5 py-1.5"
          >
            <div className="flex items-center gap-2 text-[12px] text-sky-100">
              <span className="truncate">{event.name}</span>
              <span
                className={cn(
                  'shrink-0 rounded-sm border px-1.5 text-[10px]',
                  event.type === 'impact'
                    ? 'border-red-400/40 bg-red-400/10 text-red-300'
                    : 'border-yellow-400/40 bg-yellow-400/10 text-yellow-200',
                )}
              >
                {event.type === 'impact' ? '撞击' : '预警'}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[10px] tabular-nums text-sky-500/90">
                {event.dateUTC.replace('T', ' ').slice(0, 16)} UTC
              </span>
              <span className="flex gap-1.5">
                <button
                  type="button"
                  className={OPERATION_BUTTON_CLASS}
                  onClick={() => {
                    void startSimulation(buildSimEventRecord(event.id, toSimEventFormData(event)))
                    onClose()
                  }}
                >
                  回放
                </button>
                <button
                  type="button"
                  className={OPERATION_BUTTON_CLASS}
                  onClick={() => setEditing(editableEvent(event))}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className={cn(
                    OPERATION_BUTTON_CLASS,
                    'border-red-400/25 text-red-300/90 hover:border-red-400/70 hover:text-red-200 hover:shadow-[0_0_6px_rgba(248,113,113,0.35)]',
                  )}
                  disabled={saving}
                  onClick={() => {
                    void remove(event.id).catch(() => alert('删除失败, 后端或网络异常'))
                  }}
                >
                  删除
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="hudPrimary"
        className="mt-2 w-full text-[12px] tracking-[3px]"
        onClick={() => setEditing(editableEvent())}
      >
        ＋ 新建事件
      </Button>

      {editing && (
        <SimEventDialog
          initial={editing}
          saving={saving}
          onSave={saveEvent}
          onCancel={() => setEditing(null)}
        />
      )}
    </>
  )
}
