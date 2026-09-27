import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useDataStore } from '@/store/dataStore'
import { useSimStore } from '@/store/simStore'
import { useUIStore } from '@/store/uiStore'
import { fetchAsteroidByDes, fetchEvents, type CadEvent } from '@/api/client'
import type { EventRecord } from '@/types/scene'
import { LoadingSpinner } from '@/components/ui/Loading'
import { Button } from '@/components/ui/button'

/** 弹窗只列最近的若干条 CAD 事件: 全量数百条在弹窗里没有浏览价值 */
const CAD_LIMIT = 20

const evBtnCls = (on: boolean) => cn(
  'relative w-full flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-left text-[12px] transition-all border',
  on
    ? 'text-sky-100 bg-sky-400/15 border-sky-400/50 shadow-[inset_0_0_12px_rgba(125,211,252,0.12)]'
    : 'text-sky-300/85 border-transparent hover:bg-sky-400/[0.07] hover:border-sky-400/25',
)

/** 历史事件回放弹窗内容: 内置经典事件 + JPL CAD 真实接近事件 */
export default function HistoryReplayPopup({ onClose }: { onClose: () => void }) {
  /* 内置经典事件的完整记录 (含轨道根数/背景资料), 首屏由 dataStore 取回 */
  const events = useDataStore(s => s.builtinEvents)
  const activeEvent = useEventSimulationStore(s => s.activeEvent)
  const startSimulation = useEventSimulationStore(s => s.startSimulation)
  const stopSimulation = useEventSimulationStore(s => s.stopSimulation)
  const showLoading = useUIStore(s => s.showLoading)
  const hideLoading = useUIStore(s => s.hideLoading)
  const [selected, setSelected] = useState<EventRecord | null>(null)
  const [cadSel, setCadSel] = useState<CadEvent | null>(null)
  const [cadLoading, setCadLoading] = useState(false)

  /* CAD 事件开弹窗时才现取 (服务端排序 + 限量), 不再依赖首屏全量拉取 */
  const [cadEvents, setCadEvents] = useState<CadEvent[]>([])
  useEffect(() => {
    const ctrl = new AbortController()
    let alive = true
    fetchEvents({
      source: 'cad',
      size: CAD_LIMIT,
      nowJd: useSimStore.getState().jd,
      signal: ctrl.signal,
    })
      .then((page) => {
        if (!alive) return
        setCadEvents(page.data.flatMap((it) => (it.cad ? [it.cad] : [])))
      })
      /* 后端不可达时只剩内置事件可选, 不值得为此打断弹窗 */
      .catch(() => {})
    return () => {
      alive = false
      ctrl.abort()
    }
  }, [])

  /* CAD 事件仿真: 现查 SBDB 真根数 (后端缓存) 组装 flyby 事件 */
  const startCadReplay = async (ev: CadEvent) => {
    setCadLoading(true)
    showLoading('正在查询轨道数据…', `SBDB 检索 ${ev.des}`)
    try {
      const dto = await fetchAsteroidByDes(ev.des)
      const missKm = ev.distLd * 384400
      startSimulation({
        id: `cad-${ev.cdId}`,
        name: `${ev.des} 真实接近 (JPL CAD)`,
        type: 'flyby',
        dateUTC: ev.dateIso + 'Z',
        diam: ev.diamKm ?? dto.diam ?? 0.05,
        missKm,
        leadH: 48,
        el: { a: dto.a, e: dto.e, i: dto.i, O: dto.O, w: dto.w, des: dto.des },
        img: '',
        credit: '数据: NASA/JPL CAD + SBDB',
        news: `据 NASA/JPL 近地天体研究中心 (CNEOS) 接近数据: ${ev.des} 将于 ${ev.dateIso} UTC 以 ${ev.distLd.toFixed(2)} 个月球距离接近地球。`,
        desc: `JPL CAD 真实数据: ${ev.dateIso} UTC 以约 ${(missKm / 1e6).toFixed(2)} 百万公里 (${ev.distLd.toFixed(2)} 个月球距离) 接近地球${ev.vRelKms != null ? `, 相对速度约 ${ev.vRelKms.toFixed(1)} km/s` : ''}。轨道根数来自 JPL SBDB。`,
      })
      onClose()
    } catch {
      alert('查询该天体轨道数据失败, 后端或网络异常')
    } finally {
      setCadLoading(false)
      hideLoading()
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1 max-h-[260px] overflow-y-auto pr-1">
        {events.map(ev => (
          <button
            key={ev.id}
            type="button"
            className={evBtnCls(selected?.id === ev.id)}
            onClick={() => { setSelected(ev); setCadSel(null) }}
          >
            <span className="w-1 h-1 rounded-full bg-sky-300 shadow-[0_0_5px_#7dd3fc] shrink-0" />
            {ev.name}
          </button>
        ))}
        {cadEvents.length > 0 && (
          <>
            <div className="hud-title text-[12px] px-1 pt-2 pb-1">真实接近事件 (JPL CAD)</div>
            {cadEvents.map(ev => (
              <button
                key={ev.cdId}
                type="button"
                className={evBtnCls(cadSel?.cdId === ev.cdId)}
                onClick={() => { setCadSel(ev); setSelected(null) }}
              >
                <span className="w-1 h-1 rounded-full bg-emerald-300 shadow-[0_0_5px_#34d399] shrink-0" />
                {ev.des} · {ev.dateIso.slice(0, 10)} · {ev.distLd.toFixed(2)} LD
              </button>
            ))}
          </>
        )}
      </div>
      <Button
        type="button"
        variant="hudPrimary"
        className="mt-2 w-full tracking-[4px] text-[12px]"
        disabled={(!selected && !cadSel) || cadLoading}
        onClick={() => {
          if (selected) {
            if (activeEvent?.id === selected.id) stopSimulation()
            else startSimulation(selected)
            onClose()
          } else if (cadSel) {
            void startCadReplay(cadSel)
          }
        }}
      >
        {cadLoading ? (
          <span className="inline-flex items-center gap-2">
            <LoadingSpinner size={16} /> 正在查询轨道数据…
          </span>
        ) : activeEvent ? '停止仿真' : '开始仿真'}
      </Button>
    </>
  )
}
