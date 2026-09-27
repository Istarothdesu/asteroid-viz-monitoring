import Panel from '@/components/ui/Panel'
import HudParagraph from '@/components/hud/HudParagraph'
import HudTable from '@/components/hud/HudTable'
import StepFlow from '@/components/hud/StepFlow'
import { useL1Store } from '@/features/l1/store'

const OBSERVATION_STEPS = [
  {
    title: '计划输入',
    tag: '计划层',
    description: '接收外部策略系统的标准化计划，或使用本系统内置示例。计划必须明确 ECLIPJ2000 坐标、TDB 时标、活动时段、仪器参数和完整姿态四元数。',
  },
  {
    title: '姿态与约束检查',
    tag: '仿真层',
    description: '按转向速率、加速度插值姿态，并检查视场保守包络是否满足太阳伸长角上下限、地球规避区与星历覆盖。当前为离散几何检查，不等同于飞行可执行性认证。',
  },
  {
    title: '光轴与视场渲染',
    tag: '渲染层',
    description: '姿态四元数决定光轴、横轴和纵轴；光锥只是望远镜视场的几何表达，不是卫星发出的光束。计划姿态存在时持续显示，便于观察转向过程。',
  },
  {
    title: '曝光与足迹',
    tag: '数据产品',
    description: '只有有效的仿真曝光才进行视场内几何样本计数；曝光结束后把当时视场投影记录为天区足迹。光锥经过某处不代表完成观测，更不代表已经探测到天体。',
  },
  {
    title: '复访与关联',
    tag: '任务级',
    description: '同一天区在不同时间再次曝光，形成可比较的位置序列；真正的小天体发现还需要灵敏度、信噪比、图像差分、检测关联和轨道确定链路。',
  },
]

const SURVEY_SOURCES = [
  { label: 'NEO Surveyor 任务与巡天工作方式', href: 'https://arxiv.org/html/2310.12918v1#S3' },
  { label: 'ESA Gaia 扫描律', href: 'https://gea.esac.esa.int/archive/documentation/GEDR3/Introduction/chap_cu0int/cu0int_sec_mission/cu0int_ssec_scanning_law_concepts.html' },
  { label: 'ESA Euclid 阶梯凝视设计', href: 'https://sci.esa.int/documents/33220/36137/1567257215944-Euclid_SciRD_DEM-SA-DC-0001_4_0_2010-03-22.pdf' },
  { label: 'NASA NEO 巡天研究：规避区域定义', href: 'https://www.nasa.gov/wp-content/uploads/2015/12/aoa_neo_report_final_11082018_0.pdf' },
]

export default function ObservationMetricsSection() {
  const reference = useL1Store((state) => state.reference)
  const status = useL1Store((state) => state.status)
  const profile = reference?.profile
  const demo = profile?.demo

  return (
    <>
      <Panel title="观测计划到场景的链路">
        <StepFlow steps={OBSERVATION_STEPS} />
      </Panel>

      <Panel title="活动状态与渲染语义">
        <HudTable
          headers={['活动状态', '载荷/姿态含义', '场景表达', '是否形成观测']}
          rows={[
            ['转向 slew', '卫星改变指向，通常不做科学积分', '光锥随姿态连续移动', '否'],
            ['稳定 settle', '消除转向残余并保持指向', '光锥驻留，未高亮曝光', '否'],
            ['仿真曝光 exposure', '探测器在规定积分时间内采集光子', '光锥高亮并统计视场内几何样本', '有效曝光结束后记录足迹'],
            ['读出/等待 wait', '读出、排程空档或等待下一次复访', '保留计划指向，不重复记足迹', '否'],
            ['校准 calibration', '指向标准场建立仪器响应基准', '显示校准指向；当前仅作时序示意', '不计入巡天发现'],
          ]}
        />
      </Panel>

      <Panel title="巡天模式不是同一种运动">
        <HudTable
          headers={['模式', '指向方式', '载荷配合', '本系统定位']}
          rows={[
            ['阶梯凝视 / 分区驻留', '转向一个天区，稳定后曝光，再转向下一天区', '面阵探测器逐帧积分，可抖动和复访', '当前背景巡天示例采用此模式'],
            ['连续扫描', '卫星持续自旋或匀速扫过天球', '读出必须与像移同步，并校正跨扫漂移', '作为知识与接口预留，不在当前计划生成器中伪造'],
            ['目标跟踪', '光轴持续跟随已知目标的视线方向', '曝光期间补偿目标视运动', '当前提供缓存星历目标跟踪示例'],
          ]}
        />
        <div className="mt-2">
          <HudParagraph>
            “巡天任务连续执行”描述的是长期任务节奏，不等于探测器始终曝光。阶梯凝视会反复经历
            转向、稳定、曝光和读出；Gaia 一类连续扫描任务则让天体像穿越焦平面，两者不能混用同一套动画或数据语义。
          </HudParagraph>
        </div>
      </Panel>

      <Panel title="L1 指向约束与天球图层">
        <HudTable
          headers={['图层 / 判据', '天球上的方向与半角', '参数性质']}
          rows={[
            ['日地盘面遮挡', '分别以真实日、地视方向为中心；视半径随观测距离变化', '纯几何盘面，不等于仪器规避区'],
            ['太阳规避区', `以太阳为中心 ${profile?.instrument.sunAvoidanceDeg ?? '—'}°；视场不可贴近太阳`, '角度借鉴 NEO Surveyor 可工作区间，当前仪器为仿真'],
            ['太阳伸长角上限', `伸长角 >${profile?.instrument.maxSunElongationDeg ?? '—'}°；等价于反太阳方向周围 ${profile ? 180 - profile.instrument.maxSunElongationDeg : '—'}°`, 'NEO Surveyor 参考；非 L1 通用规则，也不是地球规避'],
            ['地球规避区', `以地球为中心：动态地球视半径＋${profile?.instrument.earthAvoidanceMarginDeg ?? '—'}°`, '附加角为本系统杂散光演示假设，非 NASA 任务参数'],
          ]}
        />
        <div className="mt-2">
          <HudParagraph>
            图层绘制的是光轴方向的限制球冠；计划校验会进一步计入整个矩形视场的保守包络，因此光轴在边界外不保证曝光合法。
            太阳伸长角上下限均以卫星当时所见太阳方向计算，地球盘面及规避区以卫星当时所见地球方向计算；地球与反太阳方向不能直接视作重合。
          </HudParagraph>
        </div>
      </Panel>

      <Panel title="公开任务参考与当前仿真">
        <div className="flex flex-col gap-2.5">
          <HudTable
            headers={['项目', 'NEO Surveyor 公开口径', '当前系统配置']}
            rows={[
              ['性质', 'NASA 近地天体红外巡天任务', profile ? `${profile.name}（${profile.kind}）` : '等待参考配置'],
              ['单视场', '1.68° × 7.08°', profile ? `${profile.instrument.fovWidthDeg}° × ${profile.instrument.fovHeightDeg}°` : '—'],
              ['巡天区域', '距太阳 45°–120°，黄纬 ±40°', profile ? `距太阳 ${profile.survey.minSolarLongitudeDeg}°–${profile.survey.maxSolarLongitudeDeg}°，黄纬 ±${profile.survey.maxLatitudeDeg}°` : '—'],
              ['仪器指向可工作角', '距太阳 45°–125°', profile ? `${profile.instrument.sunAvoidanceDeg}°–${profile.instrument.maxSunElongationDeg}°` : '—'],
              ['地球附加规避角', '随任务设计确定，不能套用统一角度', profile ? `地球视半径外扩 ${profile.instrument.earthAvoidanceMarginDeg}°（演示假设）` : '—'],
              ['一次访问', '6 次六边形抖动曝光，每次 30 秒', demo ? `${demo.exposuresPerVisit} 次同指向仿真曝光，每次 ${demo.exposureSeconds} 秒；读出 ${demo.readoutSeconds} 秒` : '—'],
              ['复访', '同一天区约 6–9 小时内覆盖 4 次', demo ? `${demo.visitsPerField} 次；循环启动间隔 ${demo.revisitHours} 小时` : '—'],
              ['示例覆盖', '任务级 Loop / Quad / Stack / Side 排程', demo ? `单日一侧 ${demo.gridColumns} × ${demo.gridRows} 局部网格；相邻日换侧` : '—'],
            ]}
          />
          <HudParagraph>
            {status === 'unavailable'
              ? '当前后端参考配置不可用；上表系统列不以静态默认值冒充运行参数。'
              : '当前参数是可替换的仿真假设，只参考公开任务的分区、曝光与复访思想，不是一比一复刻 NEO Surveyor，也不宣称策略最优。'}
          </HudParagraph>
          <div className="flex flex-wrap gap-2 text-[11px]">
            {SURVEY_SOURCES.map((source) => (
              <a
                key={source.href}
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300/90 underline underline-offset-2 hover:text-cyan-100"
              >
                {source.label}
              </a>
            ))}
          </div>
        </div>
      </Panel>
    </>
  )
}
