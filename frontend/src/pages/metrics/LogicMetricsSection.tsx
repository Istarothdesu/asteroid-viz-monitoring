import Panel from '@/components/ui/Panel'
import HudParagraph from '@/components/hud/HudParagraph'
import HudTable from '@/components/hud/HudTable'
import StepFlow from '@/components/hud/StepFlow'

const RISK_STEPS = [
  {
    title: 'SBDB 轨道协方差',
    description: '取 6×6 根数协方差 (e,q,tp,Ω,ω,i) 子空间，非引力参数 (A1/A2 等) 保留快照但不参与局部模型。',
  },
  {
    title: '生成 12 个 σ 扰动样本',
    description: '对协方差做 Cholesky 分解，取中心 ± √6 倍各列，共 12 个缩放 sigma 点。',
  },
  {
    title: '同一 N 体场传播',
    description: '12 个样本与名义轨迹在同一摄动场（太阳、八大行星和月球）中传播至遭遇窗口，杜绝口径分叉。',
  },
  {
    title: 'B 平面投影',
    description: '各样本在各自最近遭遇点求地心相对状态，投影到 B 平面得 (ξ,ζ) 与引力聚焦后的有效撞击半径。',
  },
  {
    title: 'Sobol 积分求局部撞击概率',
    description: '由样本得 B 平面二维协方差，Sobol 低差异序列采样二维高斯，统计落入有效撞击圆的比例。',
  },
  {
    title: '3σ 不确定性管',
    description: '各时间截面上 12 个样本相对名义轨迹求二阶矩，特征分解取最大两主轴为椭圆截面半径 (3√λ)，±3 天窗口共 80 个截面。',
  },
]

export default function LogicMetricsSection() {
  return (
    <>
      <Panel title="事件三源汇聚">
        <div className="flex flex-col gap-2">
          <HudParagraph>
            三个来源在服务端归一为一个事件目录，过滤、排序、分页、计数全部由服务端完成，
            前端不再一次性拉取全量。
          </HudParagraph>
          <HudTable
            headers={['来源', '产生方式', '说明']}
            rows={[
              ['内置经典', '手工内置 5 条（通古斯、车里雅宾斯克、Apophis 等）', '随镜像发布，用于历史仿真'],
              ['JPL CAD', '每 6 小时定时同步入 close_approaches 表', '含遭遇时刻、距离（含 3σ 区间）、相对速度和 H 星等'],
              ['用户推演', '前端表单创建，sim_events 表 CRUD', '参数完全由用户给定'],
            ]}
          />
        </div>
      </Panel>
      <Panel title="关键参数的计算方法">
        <HudTable
          headers={['参数', '计算方法']}
          rows={[
            ['直径估算', '由绝对星等 H 按反照率 0.15 反算（无实测直径时的统一口径）'],
            ['遭遇距离', 'CAD 月球距离 (LD) × 384400 km；内置、推演事件取用户给定值'],
            ['事件轨道', '仅含五根数 {a,e,i,Ω,ω}，由遭遇时刻地心几何反解 Ω/ω/M0 拟合穿过遭遇点；命中烘焙星历时位置以星历为准'],
            ['危险等级', '服务端按类型、距离和直径统一分档 (critical / high / medium / low)'],
            ['N 体推演', 'DOP853 数值积分 (rtol 1e-11)：太阳点质量 + 八大行星 + 月球摄动，初值优先取烘焙星历网格点'],
          ]}
        />
      </Panel>
      <Panel title="风险分析口径">
        <div className="flex flex-col gap-2.5">
          <StepFlow steps={RISK_STEPS} />
          <HudParagraph>
            口径限制：局部线性近似仅在协方差历元 10 年内有效；远期风险以 JPL Sentry
            官方解算为准。本系统结果仅作事件分析辅助，不构成官方预报。
          </HudParagraph>
        </div>
      </Panel>
    </>
  )
}
