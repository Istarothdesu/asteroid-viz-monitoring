import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { TOOLTIP_STYLE } from './theme'
import type { ChartDatum } from './types'

interface DonutChartProps {
  data: ChartDatum[]
  centerTotal?: number
  centerLabel?: string
  height?: number
  ariaLabel?: string
  onItemClick?: (datum: ChartDatum) => void
}

export default function DonutChart({
  data,
  centerTotal,
  centerLabel = '总数',
  height = 130,
  ariaLabel = '环形统计图',
  onItemClick,
}: DonutChartProps) {
  const total = centerTotal ?? data.reduce((sum, datum) => sum + datum.value, 0)
  const option = useMemo(() => ({
    aria: { enabled: true, decal: { show: false }, label: { description: ariaLabel } },
    tooltip: { trigger: 'item', ...TOOLTIP_STYLE, formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['62%', '84%'],
      center: ['50%', '50%'],
      cursor: onItemClick ? 'pointer' : 'default',
      itemStyle: { borderColor: '#030712', borderWidth: 2 },
      label: { show: false },
      emphasis: { scaleSize: 4 },
      data: data.map((datum) => ({
        id: datum.id,
        name: datum.name,
        value: datum.value,
        itemStyle: { color: datum.color },
      })),
    }],
    graphic: [
      {
        type: 'text', left: 'center', top: '38%',
        style: { text: String(total), fill: '#fff', fontSize: 20, fontWeight: 700, textAlign: 'center' },
      },
      {
        type: 'text', left: 'center', top: '56%',
        style: { text: centerLabel, fill: '#7da2c9', fontSize: 10, textAlign: 'center' },
      },
    ],
  }), [ariaLabel, centerLabel, data, onItemClick, total])

  const onEvents = useMemo(() => onItemClick
    ? {
        click: (params: { dataIndex: number }) => {
          const datum = data[params.dataIndex]
          if (datum) onItemClick(datum)
        },
      }
    : undefined, [data, onItemClick])

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <ReactECharts
        option={option}
        onEvents={onEvents}
        notMerge
        lazyUpdate
        style={{ height, width: height }}
        opts={{ renderer: 'canvas' }}
      />
      <div className="flex flex-1 flex-col gap-1.5">
        {data.map((datum) => (
          <div key={datum.id ?? datum.name} className="flex items-center gap-2 text-[11px]">
            <span className="inline-block size-2 rounded-[2px]" style={{ background: datum.color }} />
            <span style={{ color: 'var(--dim)' }}>{datum.name}</span>
            <span className="ml-auto font-semibold text-white">{datum.value}</span>
            <span className="w-11 text-right tabular-nums" style={{ color: 'var(--dim)' }}>
              {total > 0 ? (datum.value / total * 100).toFixed(1) : '0.0'}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
