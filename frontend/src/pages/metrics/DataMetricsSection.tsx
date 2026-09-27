import { useEffect, useState } from 'react'
import Panel from '@/components/ui/Panel'
import HudParagraph from '@/components/hud/HudParagraph'
import HudTable from '@/components/hud/HudTable'
import { cn } from '@/lib/utils'
import { fetchSyncStatus, type SyncStatusEntry } from '@/api/client'

const SOURCES = [
  ['JPL SBDB', '小行星轨道根数 (a/e/i/Ω/ω/M) 与轨道协方差矩阵', '命名清单每日 03:00；单天体按需现查并缓存'],
  ['JPL CAD', '未来近地接近事件 (距离 ≤ 20 个月球距离)', '每 6 小时全量替换'],
  ['JPL Sentry', '官方撞击风险汇总 (撞击概率 / 巴林指数 / 都灵指数)', '每 12 小时'],
  ['MPC MPCORB.DAT', '云带族群背景样本 (分段下载 + 分层蓄水池抽样)', '每周日 04:00'],
  ['JPL Horizons', '重点小行星 (PHA + 命名清单) 逐日全摄动状态向量', '离线烘焙，随镜像打包'],
  ['SPICE 内核 (de430/de440s + naif0012.tls)', '八大行星与月球星历烘焙原料', '离线烘焙，随镜像打包'],
]

const SYNC_LABELS: [key: string, label: string][] = [
  ['named', 'SBDB 命名根数'],
  ['cad', 'CAD 接近事件'],
  ['sentry', 'Sentry 风险汇总'],
  ['mpcorb', 'MPCORB 云带样本'],
  ['ephem', '行星星历烘焙'],
  ['ephem_ast', '重点小行星星历烘焙'],
]

function SyncStatusTable() {
  const [rows, setRows] = useState<Record<string, SyncStatusEntry> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSyncStatus()
      .then((data) => { if (!cancelled) setRows(data) })
      .catch(() => { if (!cancelled) setRows(null) })
    return () => { cancelled = true }
  }, [])

  if (!rows) {
    return <HudParagraph>同步状态暂不可用（离线部署或后端未上报），上方为设计口径。</HudParagraph>
  }

  return (
    <HudTable
      headers={['数据源', '最近同步 (UTC)', '记录数', '状态']}
      rows={SYNC_LABELS.filter(([key]) => rows[key]).map(([key, label]) => [
        label,
        rows[key].lastSyncAt ? `${rows[key].lastSyncAt!.replace('T', ' ').slice(0, 19)} UTC` : '—',
        rows[key].recordCount.toLocaleString(),
        <span
          key="status"
          className={cn(rows[key].status === 'ok' ? 'text-emerald-400/90' : 'text-amber-400/90')}
        >
          {rows[key].status}
        </span>,
      ])}
    />
  )
}

export default function DataMetricsSection() {
  return (
    <>
      <Panel title="外部数据源总览">
        <div className="flex flex-col gap-2">
          <HudParagraph>
            全部原始数据来自 NASA/JPL 与小行星中心 (MPC) 的公开接口。系统按
            「数据工厂」模式运行：外网机器完成下载与烘焙，产出 SQLite 种子库随镜像打包；
            运行时可完全离线，仅消费库中数据。
          </HudParagraph>
          <HudTable headers={['数据源', '提供内容', '同步周期']} rows={SOURCES} />
        </div>
      </Panel>
      <Panel title="实时同步指标">
        <SyncStatusTable />
      </Panel>
    </>
  )
}
