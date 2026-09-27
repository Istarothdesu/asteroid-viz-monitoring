import { create } from 'zustand'

export type EventSceneTask = 'propagation' | 'bPlane' | 'uncertainty'
export type EventSceneTaskState = 'idle' | 'loading' | 'error'

export interface EventSceneTaskStatus {
  state: EventSceneTaskState
  message: string | null
}

export type EventSceneTasks = Record<EventSceneTask, EventSceneTaskStatus>

const emptyTasks = (): EventSceneTasks => ({
  propagation: { state: 'idle', message: null },
  bPlane: { state: 'idle', message: null },
  uncertainty: { state: 'idle', message: null },
})

interface EventSceneState {
  contextId: string | null
  tasks: EventSceneTasks
  activate: (contextId: string) => void
  startTask: (contextId: string, task: EventSceneTask) => void
  failTask: (contextId: string, task: EventSceneTask, message: string) => void
  finishTask: (contextId: string, task: EventSceneTask) => void
  clear: (contextId?: string) => void
}

/** 事件功能层只保留任务状态；几何产品归核心场景注册表管理。 */
export const useEventSceneStore = create<EventSceneState>((set) => ({
  contextId: null,
  tasks: emptyTasks(),
  activate: (contextId) => set((state) => state.contextId === contextId ? state : ({
    contextId,
    tasks: emptyTasks(),
  })),
  startTask: (contextId, task) => set((state) => state.contextId !== contextId ? state : ({
    tasks: { ...state.tasks, [task]: { state: 'loading', message: null } },
  })),
  failTask: (contextId, task, message) => set((state) => state.contextId !== contextId ? state : ({
    tasks: { ...state.tasks, [task]: { state: 'error', message } },
  })),
  finishTask: (contextId, task) => set((state) => state.contextId !== contextId ? state : ({
    tasks: { ...state.tasks, [task]: { state: 'idle', message: null } },
  })),
  clear: (contextId) => set((state) => contextId && state.contextId !== contextId ? state : ({
    contextId: null,
    tasks: emptyTasks(),
  })),
}))
