import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { AXIS_STYLE, CHART_FONT, TOOLTIP_STYLE } from './theme'

interface BarChartProps {
  labels: string[]
  values: number[]
  height?: number
  compact?: boolean
  colorFrom?: string
  colorTo?: string
  ariaLabel?: string
  onItemClick?: (index: number) => void
}

/** ECharts 柱状图；业务组件只传数据与交互，不自行绘制统计图形。 */
export default function BarChart({
  labels,
  values,
  height = 150,
  compact = false,
  colorFrom = 'rgba(56,189,248,.15)',
  colorTo = '#38bdf8',
  ariaLabel = '柱状统计图',
  onItemClick,
}: BarChartProps) {
  const option = useMemo(() => ({
    aria: { enabled: true, decal: { show: false }, label: { description: ariaLabel } },
    animationDuration: 280,
    grid: compact
      ? { left: 8, right: 8, top: 20, bottom: 18 }
      : { left: 28, right: 8, top: 24, bottom: 22 },
    tooltip: { trigger: 'item', ...TOOLTIP_STYLE },
    xAxis: {
      type: 'category',
      data: labels,
      ...AXIS_STYLE,
      axisLabel: { ...AXIS_STYLE.axisLabel, fontSize: compact ? 8 : 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      show: !compact,
      ...AXIS_STYLE,
      axisLine: { show: false },
    },
    series: [{
      type: 'bar',
      data: values,
      barWidth: compact ? '58%' : '46%',
      cursor: onItemClick ? 'pointer' : 'default',
      itemStyle: {
        borderRadius: [3, 3, 0, 0],
        color: {
          type: 'linear', x: 0, y: 1, x2: 0, y2: 0,
          colorStops: [
            { offset: 0, color: colorFrom },
            { offset: 1, color: colorTo },
          ],
        },
      },
      label: {
        show: true,
        position: 'top',
        color: '#dbeafe',
        fontSize: compact ? 8 : 10,
        fontFamily: CHART_FONT,
      },
    }],
  }), [ariaLabel, colorFrom, colorTo, compact, labels, onItemClick, values])

  const onEvents = useMemo(() => onItemClick
    ? { click: (params: { dataIndex: number }) => onItemClick(params.dataIndex) }
    : undefined, [onItemClick])

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
