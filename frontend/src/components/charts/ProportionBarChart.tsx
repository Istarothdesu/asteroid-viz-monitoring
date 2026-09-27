import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { TOOLTIP_STYLE } from './theme'
import type { ChartDatum } from './types'

interface ProportionBarChartProps {
  data: ChartDatum[]
  height?: number
  ariaLabel?: string
  onItemClick?: (datum: ChartDatum) => void
}

/** 单行堆叠占比图，适合紧凑面板中的等级或来源分布。 */
export default function ProportionBarChart({
  data,
  height = 28,
  ariaLabel = '占比统计图',
  onItemClick,
}: ProportionBarChartProps) {
  const total = Math.max(data.reduce((sum, datum) => sum + datum.value, 0), 1)
  const option = useMemo(() => ({
    aria: { enabled: true, decal: { show: false }, label: { description: ariaLabel } },
    animationDuration: 240,
    grid: { left: 0, right: 0, top: 6, bottom: 6 },
    tooltip: {
      trigger: 'item',
      ...TOOLTIP_STYLE,
      formatter: (params: { seriesName: string; value: number }) =>
        `${params.seriesName}: ${params.value} (${(params.value / total * 100).toFixed(1)}%)`,
    },
    xAxis: { type: 'value', max: total, show: false },
    yAxis: { type: 'category', data: [''], show: false },
    series: data.map((datum, index) => ({
      name: datum.name,
      type: 'bar',
      stack: 'total',
      cursor: onItemClick ? 'pointer' : 'default',
      barWidth: 9,
      data: [{ value: datum.value, itemId: datum.id }],
      itemStyle: {
        color: datum.color,
        borderRadius: index === 0
          ? [5, 0, 0, 5]
          : index === data.length - 1 ? [0, 5, 5, 0] : 0,
      },
      emphasis: { focus: 'series' },
    })),
  }), [ariaLabel, data, onItemClick, total])

  const onEvents = useMemo(() => onItemClick
    ? {
        click: (params: { seriesIndex: number }) => {
          const datum = data[params.seriesIndex]
          if (datum) onItemClick(datum)
        },
      }
    : undefined, [data, onItemClick])

  return (
    <ReactECharts
      option={option}
      onEvents={onEvents}
      notMerge
      lazyUpdate
      style={{ height }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
