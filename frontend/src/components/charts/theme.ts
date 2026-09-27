export const CHART_FONT = '"Microsoft YaHei","PingFang SC",system-ui,sans-serif'

export const AXIS_STYLE = {
  axisLine: { lineStyle: { color: 'rgba(56,189,248,.25)' } },
  axisTick: { show: false },
  axisLabel: { color: '#7da2c9', fontSize: 10, fontFamily: CHART_FONT },
  splitLine: { lineStyle: { color: 'rgba(56,189,248,.08)' } },
} as const

export const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(4,12,26,.95)',
  borderColor: 'rgba(56,189,248,.4)',
  textStyle: { color: '#dbeafe', fontSize: 12, fontFamily: CHART_FONT },
  extraCssText: 'box-shadow: 0 0 14px rgba(56,189,248,.35); backdrop-filter: blur(4px);',
} as const
