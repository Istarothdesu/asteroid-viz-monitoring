import { useEffect } from 'react'
import { formatL1Time, useL1Store } from './store'

/** 面板时钟刷新才取分段映射，不在渲染帧中发请求。 */
export function useMissionClock(jdTdb: number, enabled = true): string {
  const axis = useL1Store(s => s.timeAxis)
  useEffect(() => {
    if (enabled) void useL1Store.getState().ensureTimeAxis(jdTdb)
  }, [jdTdb, enabled])
  return formatL1Time(jdTdb, axis)
}
