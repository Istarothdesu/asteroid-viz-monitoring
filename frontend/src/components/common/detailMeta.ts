/** 专题页顶部返回按钮的共享样式。 */
export const DETAIL_BACK_BUTTON_CLASS =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-[12px] text-sky-300/90 border border-sky-400/25 bg-[rgba(8,20,42,0.75)] hover:border-sky-300/70 hover:text-sky-100 hover:shadow-[0_0_10px_rgba(125,211,252,0.4)] transition-all cursor-pointer whitespace-nowrap'

/** 观测任务优先级展示元数据。 */
export const PRIORITY_META: Record<string, { zh: string; cls: string }> = {
  urgent: { zh: '紧急', cls: 'border-red-400/50 text-red-300 bg-red-400/10' },
  high: { zh: '高', cls: 'border-amber-400/50 text-amber-300 bg-amber-400/10' },
  medium: { zh: '中', cls: 'border-sky-400/40 text-sky-300 bg-sky-400/10' },
  low: { zh: '低', cls: 'border-sky-400/20 text-sky-400/70 bg-sky-400/[0.04]' },
}

/** 观测任务与 L1 任务共用的执行状态展示元数据。 */
export const TASK_STATUS_META: Record<string, { zh: string; cls: string }> = {
  planned: { zh: '待执行', cls: 'text-sky-300 border-sky-400/40 bg-sky-400/10' },
  executing: {
    zh: '执行中',
    cls: 'text-emerald-300 border-emerald-400/50 bg-emerald-400/10',
  },
  completed: {
    zh: '已完成',
    cls: 'text-sky-400/70 border-sky-400/20 bg-sky-400/[0.04]',
  },
}
