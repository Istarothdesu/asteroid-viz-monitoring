import { create } from 'zustand'
import { ASTEROIDS } from '@/data/asteroids'
import type { AsteroidRecord, CloudSeed } from '@/types/asteroid'
import type { EventRecord } from '@/types/scene'
import {
  fetchAsteroids, fetchBuiltinRecords, fetchCloudSeeds, fetchEphemeris, fetchEventCounts,
  type EventCounts,
} from '@/api/client'
import { loadEphemeris } from '@/utils/orbital/ephemeris'
import { nowJD } from '@/utils/orbital/time'
import { useL1Store } from '@/features/l1/store'

/** H 星等 → 直径 km (反照率 0.14): 1329 / sqrt(0.14) */
const H_TO_DIAM_K = 3543.9
const diamFromH = (h: number) => H_TO_DIAM_K * 10 ** (-h / 5)

interface DataState {
  /** 命名小行星; 初始为静态数据, 后端可用时替换为真根数 (顺序一致, 索引稳定) */
  asteroids: AsteroidRecord[]
  /** 云带真实样本; null = 使用程序化生成 */
  cloudSeeds: CloudSeed[] | null
  /** 内置经典事件的完整记录 (历史回放/仿真用); 列表与详情由事件接口分页供数 */
  builtinEvents: EventRecord[]
  /** 事件目录页签计数 (顶栏角标); null = 尚未取到或后端不可达 */
  eventCounts: EventCounts | null
  loaded: boolean
  setEventCounts: (counts: EventCounts) => void
  load: () => Promise<void>
}

export const useDataStore = create<DataState>((set, get) => ({
  asteroids: ASTEROIDS,
  cloudSeeds: null,
  builtinEvents: [],
  eventCounts: null,
  loaded: false,
  setEventCounts: (eventCounts) => set({ eventCounts }),
  load: async () => {
    if (get().loaded) return
    const [astR, cloudR, builtinR, countsR, ephR] = await Promise.allSettled([
      fetchAsteroids(),
      fetchCloudSeeds(),
      fetchBuiltinRecords(),
      fetchEventCounts(nowJD()),
      fetchEphemeris(),
      useL1Store.getState().load(),
    ])
    const patch: Partial<DataState> = { loaded: true }
    // 星历到位前 planetPos 走简化根数表, 到位后透明切换到 SPICE 精度
    if (ephR.status === 'fulfilled') loadEphemeris(ephR.value)
    // 仅当长度一致时替换 (后端按命名球表顺序返回), 防止索引错位
    if (astR.status === 'fulfilled' && astR.value.length === ASTEROIDS.length) {
      patch.asteroids = astR.value
    }
    if (cloudR.status === 'fulfilled') {
      const seeds: CloudSeed[] = []
      for (const [pop, rows] of Object.entries(cloudR.value)) {
        if (!rows) continue
        for (const [a, e, i, om, w, m0, h, des] of rows) {
          seeds.push({
            pop: pop as CloudSeed['pop'],
            a, e, i, om, w, m0,
            diam: h > 0 ? diamFromH(h) : 1,
            ...(des ? { des } : {}),
          })
        }
      }
      if (seeds.length > 0) patch.cloudSeeds = seeds
    }
    if (builtinR.status === 'fulfilled') patch.builtinEvents = builtinR.value
    if (countsR.status === 'fulfilled') patch.eventCounts = countsR.value
    set(patch)
  },
}))
