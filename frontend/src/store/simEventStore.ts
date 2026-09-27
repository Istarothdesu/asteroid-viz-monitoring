import { create } from 'zustand'
import {
  createSimEvent, deleteSimEvent, fetchEventCounts, fetchSimEvents, updateSimEvent,
  type SimEvent, type SimEventInput,
} from '@/api/client'
import { nowJD } from '@/utils/orbital/time'
import { useDataStore } from './dataStore'

/* 推演事件的模型定义已下移到后端 (入库共享), 这里只转出 wire 类型以保持既有导入路径 */
export type { SimEvent, SimEventInput }

/** 旧版把推演事件存 localStorage; 改为入库共享后只做一次搬运 */
const STORAGE_KEY = 'sta-intra:simEvents'
const MIGRATED_KEY = 'sta-intra:simEventsMigrated'

function legacyLocal(): SimEvent[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(rows) ? (rows as SimEvent[]) : []
  } catch {
    return []
  }
}

/** 去掉 id 得到写入用的载荷 (后端自己生成主键) */
function toInput(ev: SimEvent): SimEventInput {
  const { id: _id, ...rest } = ev
  return rest
}

/** 增删改后刷新顶栏角标计数; 计数接口很轻 (size=0), 失败不影响本次写入 */
function refreshCounts(): void {
  fetchEventCounts(nowJD())
    .then((counts) => useDataStore.getState().setEventCounts(counts))
    .catch(() => {})
}

interface SimEventState {
  events: SimEvent[]
  loaded: boolean
  /** 写入进行中: 表单/按钮据此禁用, 避免重复提交 */
  saving: boolean
  /** 变更计数: 每次拉取/增删改递增, 供事件列表等服务端供数方作为重取触发器 */
  revision: number
  load: (force?: boolean) => Promise<void>
  add: (input: SimEventInput) => Promise<SimEvent>
  update: (ev: SimEvent) => Promise<SimEvent>
  remove: (id: string) => Promise<void>
}

export const useSimEventStore = create<SimEventState>((set, get) => ({
  events: [],
  loaded: false,
  saving: false,
  revision: 0,

  load: async (force = false) => {
    if (get().loaded && !force) return
    const rows = await fetchSimEvents()
    if (!localStorage.getItem(MIGRATED_KEY)) {
      /* 后端为空且本地有旧数据 → 逐条上报; 单条失败不阻断其余 */
      const legacy = legacyLocal()
      if (rows.length === 0 && legacy.length > 0) {
        for (const ev of legacy) {
          try {
            rows.push(await createSimEvent(toInput(ev)))
          } catch {
            /* 忽略: 校验不过的历史脏数据不值得让用户看到红条 */
          }
        }
      }
      localStorage.setItem(MIGRATED_KEY, '1')
      localStorage.removeItem(STORAGE_KEY)
    }
    set({ events: rows, loaded: true, revision: get().revision + 1 })
  },

  add: async (input) => {
    set({ saving: true })
    try {
      const ev = await createSimEvent(input)
      set({ events: [...get().events, ev], revision: get().revision + 1 })
      refreshCounts()
      return ev
    } finally {
      set({ saving: false })
    }
  },

  update: async (ev) => {
    set({ saving: true })
    try {
      const saved = await updateSimEvent(ev.id, toInput(ev))
      set({
        events: get().events.map((e) => (e.id === saved.id ? saved : e)),
        revision: get().revision + 1,
      })
      refreshCounts()
      return saved
    } finally {
      set({ saving: false })
    }
  },

  remove: async (id) => {
    set({ saving: true })
    try {
      await deleteSimEvent(id)
      set({
        events: get().events.filter((e) => e.id !== id),
        revision: get().revision + 1,
      })
      refreshCounts()
    } finally {
      set({ saving: false })
    }
  },
}))
