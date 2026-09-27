import { useSyncExternalStore } from 'react'
import { sceneRef } from '@/core/SceneManager'
import { useSimStore } from '@/store/simStore'

/**
 * 仿真时钟订阅 (共享定时器收敛版)。
 *
 * 此前每个 hook 实例各自持有 setInterval (~18 处消费点), 同频率的消费端
 * 分散触发 React 渲染; 现按请求频率收敛为模块级单定时器: 同频率消费端
 * 共享一个 store, 同一帧批量通知; 数值未变 (暂停) 时零通知零渲染。
 *
 * quantum: 快照量子化 (天)。列表/分类等粗粒度消费端传 1 —— 快照仅在
 * 跨天时变化, 播放期间从每秒重渲染降为每个模拟日一次; 秒级读数不要用量子。
 */
interface TickStore {
  jd: number
  listeners: Set<() => void>
  timer: ReturnType<typeof setInterval> | undefined
  subscribe: (cb: () => void) => () => void
}

const stores = new Map<number, TickStore>()

function ensureStore(ms: number): TickStore {
  let s = stores.get(ms)
  if (s) return s
  s = {
    jd: useSimStore.getState().jd,
    listeners: new Set(),
    timer: undefined,
    subscribe: (cb) => {
      s!.listeners.add(cb)
      if (s!.listeners.size === 1) {
        /* 首个订阅者: 先对齐当前值 (场景未就绪时退回 store 的 jd), 再起定时器 */
        const live = sceneRef.current?.liveJd.value
        s!.jd = live != null && live > 0 ? live : useSimStore.getState().jd
        s!.timer = setInterval(() => tick(s!), ms)
      }
      return () => {
        s!.listeners.delete(cb)
        if (s!.listeners.size === 0 && s!.timer !== undefined) {
          clearInterval(s!.timer)
          s!.timer = undefined
        }
      }
    },
  }
  stores.set(ms, s)
  return s
}

function tick(s: TickStore): void {
  const live = sceneRef.current?.liveJd.value
  if (live == null || live <= 0 || live === s.jd) return
  s.jd = live
  for (const fn of s.listeners) fn()
}

export function useLiveJd(intervalMs = 250, quantum = 0): number {
  const s = ensureStore(intervalMs)
  return useSyncExternalStore(
    s.subscribe,
    quantum > 0
      ? () => Math.floor(s.jd / quantum) * quantum
      : () => s.jd,
  )
}
