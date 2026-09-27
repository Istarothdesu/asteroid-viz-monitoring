import { useEffect, useRef, useState } from 'react'

/** 时钟基准推进的最小间隔 (ms): 比这更密的跨天变化合并为末尾一次补发 */
const MIN_GAP = 2500

/**
 * 仿真时钟限流基准 (服务端供数用)。
 *
 * useLiveJd(1000, 1) 已把快照量子化到「模拟日」, 但最高倍速下每秒都会跨天,
 * 直接拿它当请求依赖会打出每秒数个分页/详情查询, 而列表分类几乎没变化。
 * 这里把基准推进收敛为「最快 MIN_GAP 一次 + 末尾补一次」:
 * 播放停下后仍会补发最后一次, 保证分类与当前时刻一致。
 *
 * enabled=false 时冻结基准 (事件仿真期间时钟在事件窗口内快速推进,
 * 此时重取整份目录没有意义), 恢复后自动追平到最新时刻。
 */
export function useThrottledNowJd(dayJd: number, enabled = true): number {
  const [nowJd, setNowJd] = useState(dayJd)
  /* 定时器回调读最新值, 免得把 dayJd 塞进依赖导致补发反复重建 */
  const latest = useRef(dayJd)
  latest.current = dayJd
  const lastAt = useRef(0)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled || dayJd === nowJd) return
    const wait = MIN_GAP - (Date.now() - lastAt.current)
    if (wait <= 0) {
      lastAt.current = Date.now()
      setNowJd(dayJd)
      return
    }
    if (timer.current !== null) return // 已有末尾补发在排队
    timer.current = window.setTimeout(() => {
      timer.current = null
      lastAt.current = Date.now()
      setNowJd(latest.current)
    }, wait)
  }, [dayJd, nowJd, enabled])

  /* 卸载或转入冻结态时取消排队中的补发 */
  useEffect(
    () => () => {
      if (timer.current == null) return
      window.clearTimeout(timer.current)
      timer.current = null
    },
    [enabled],
  )

  return nowJd
}
