import Panel from '@/components/ui/Panel'
import HudParagraph from '@/components/hud/HudParagraph'
import StepFlow from '@/components/hud/StepFlow'

const COMPUTE_STEPS = [
  {
    title: '原始状态向量获取',
    tag: '离线烘焙',
    description: '行星/月球由 SPICE 内核 (de430/de440s) 采样 1900–2100 年；重点小行星由 JPL Horizons 逐日拉取 1980–2060 年全摄动状态向量。',
  },
  {
    title: '均匀时标网格采样',
    tag: '离线烘焙',
    description: '按轨道快慢分档步长 (行星 0.25–4 天，小行星 1–2 天) 在均匀时标 (86400 s/天) 上采样，全链路与前端时钟刚性对齐，不做 UTC 闰秒转换。',
  },
  {
    title: '单位与坐标系统一',
    tag: '离线烘焙',
    description: 'km→AU、km/s→AU/天换算，坐标系统一为 ECLIPJ2000 日心黄道；月球存地心相对坐标。',
  },
  {
    title: '二进制块入库',
    tag: '离线烘焙',
    description: '位置 float64 + 速度 float32 交错排列存入 SQLite（速度项供 Hermite 插值），附起始儒略日、步长和点数元数据。',
  },
  {
    title: '出厂校验',
    tag: '离线烘焙',
    description: 'validate.py 六项校验：插值精度、能量不变量、历元新鲜度、Horizons 对拍、小行星插值、N 体推演对拍，全部通过才允许打包。',
  },
  {
    title: '二进制流一次下发',
    tag: '运行时',
    description: '/api/ephemeris 以自定义二进制流 (GZip) 一次下发全部烘焙星历，前端解析进内存。',
  },
  {
    title: 'Hermite 插值取位置',
    tag: '运行时 · 前端',
    description: '任意时刻位置由三次 Hermite 插值求得（误差 ≪1 km）；未烘焙天体回退开普勒二体解析解。',
  },
  {
    title: '采样绘制轨道线',
    tag: '运行时 · 前端',
    description: '轨道线自当前时刻起按一个恒星周期采样 361 个位置点连线；云带约 1.7 万粒子分帧解开普勒方程并实例化渲染。',
  },
]

export default function ComputeMetricsSection() {
  return (
    <>
      <Panel title="轨道数据加工链路">
        <StepFlow steps={COMPUTE_STEPS} />
      </Panel>
      <Panel title="坐标与时标约定">
        <HudParagraph>
          场景单位 AU，日心黄道 J2000，黄道面为 XY 平面；四个坐标系（日心、地心、L1、伴飞）
          不重建几何，只做「减中心 + 帧旋转」的统一刚体变换；几何层永远真实比例，
          远景可见性由辉光标记层承担。
        </HudParagraph>
      </Panel>
    </>
  )
}
