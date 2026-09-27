/**
 * 知识库静态数据与检索。
 *
 * 内容定位: 帮助不了解天文背景的用户快速积累常识、读懂系统。
 * 文案口径与系统实现一致 (数据层/计算层/逻辑层说明见技术指标页);
 * 静态数据随前端打包, 内网离线可用, 不走后端。
 */

export type KnowledgeCategory = "basic" | "orbit" | "observation" | "family" | "risk" | "guide";

export const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  basic: "天文基础",
  orbit: "轨道力学",
  observation: "巡天与载荷",
  family: "小行星家族",
  risk: "事件与风险",
  guide: "系统指南",
};

export interface KnowledgeEntry {
  id: string;
  title: string;
  category: KnowledgeCategory;
  /** 别名 / 英文缩写, 参与检索 */
  keywords: string[];
  /** 列表摘要 (一两句) */
  summary: string;
  /** 正文段落 */
  body: string[];
  /** 可选权威外部资料 */
  sources?: { label: string; url: string }[];
  /** 可选站内跳转 */
  link?: { to: string; label: string };
}

export const KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  /* ---------------- 天文基础 ---------------- */
  {
    id: "au",
    title: "天文单位 (AU)",
    category: "basic",
    keywords: ["astronomical unit", "日地距离"],
    summary: "日地平均距离, 约 1.496 亿公里, 是太阳系内最常用的长度单位。",
    body: [
      "1 天文单位 (AU) = 149,597,870.7 公里, 约为地球到太阳的平均距离。太阳系内的距离、轨道半长轴通常都以 AU 表示——例如主带小行星的轨道半长轴大多在 2.1–3.3 AU 之间。",
      "本系统三维场景的内部单位就是 AU: 所有天体位置、轨道线都以日心黄道坐标 (AU) 存储和渲染, 只有展示层才换算成公里或月球距离。",
    ],
  },
  {
    id: "ld",
    title: "月球距离 (LD)",
    category: "basic",
    keywords: ["lunar distance", "地月距离"],
    summary: "地球到月球的平均距离, 约 38.4 万公里, 近地接近事件的常用度量。",
    body: [
      '1 月球距离 (LD) = 384,400 公里。近地天体接近事件的报道中几乎都用 LD 表示遭遇距离——"0.29 LD 接近地球"比"11.1 万公里"更容易建立直觉。',
      "本系统事件中心中, CAD 接近事件的距离字段原始单位就是 LD, 展示时按 1 LD = 384,400 km 换算为公里。",
    ],
  },
  {
    id: "jd",
    title: "儒略日 (JD) 与均匀时标",
    category: "basic",
    keywords: ["julian date", "时间", "时标", "TDB", "UTC"],
    summary: "天文学用连续计数的天数表示时刻; 本系统全链路采用均匀时标。",
    body: [
      "儒略日 (Julian Date) 是从公元前 4713 年 1 月 1 日起连续计数的天数, 例如 J2000.0 历元 = JD 2451545.0 (2000-01-01 12:00)。它避免了历法与闰秒的麻烦, 是星历表的通用时间轴。",
      "实际时间系统有多种: UTC 有闰秒、TDB 是质心力学时。本系统为与前端时钟刚性对齐, 全链路统一使用 86400 秒/天的均匀时标, 不做 UTC 闰秒转换——这带来不超过约 37 秒的民用时刻语义偏差, 但系统内部完全自洽。",
    ],
  },
  {
    id: "h-mag",
    title: "绝对星等 H 与直径换算",
    category: "basic",
    keywords: ["magnitude", "星等", "亮度", "直径", "反照率"],
    summary: "小行星大多没有实测直径, 由绝对星等 H 按假设反照率反算。",
    body: [
      "绝对星等 H 是小行星在距太阳和观测者各 1 AU、相位角 0° 时的视星等, 反映其本征亮度。H 越小天体越大越亮: H=22 约对应 130 米级, H=18 约对应 1 公里级。",
      '直径换算公式: D(km) = 1329 / √p × 10^(-H/5), 其中 p 是几何反照率。由于多数小行星没有实测反照率, 本系统事件口径统一取 p=0.15 估算直径——这也是"直径估算"与实测值可能有出入的原因。',
      "PHA (潜在危险天体) 的尺寸判据 H≤22 正是由此换算的约 140 米直径门槛。",
    ],
  },
  {
    id: "j2000",
    title: "黄道与 J2000 坐标系",
    category: "basic",
    keywords: ["ECLIPJ2000", "坐标系", "黄道面", "历元"],
    summary: "太阳系轨道计算的 standard 参考系: J2000 历元的日心黄道坐标。",
    body: [
      "黄道面是地球公转轨道所在的平面。由于地球自转轴缓慢进动, 坐标轴必须绑定一个固定历元——J2000.0 (2000-01-01 12:00 TDB) 是目前通用的标准历元。",
      "ECLIPJ2000 即以 J2000 时刻的黄极和春分方向定义的坐标系。本系统全部星历、轨道根数、N 体积分都在 ECLIPJ2000 日心坐标下进行; 场景中日心黄道面为 XY 平面, Z 轴垂直向上。",
    ],
  },

  /* ---------------- 轨道力学 ---------------- */
  {
    id: "elements",
    title: "开普勒六根数",
    category: "orbit",
    keywords: ["orbital elements", "轨道根数", "半长轴", "偏心率", "倾角"],
    summary: "用六个数完整描述一条开普勒轨道: 形状两个、指向三个、相位一个。",
    body: [
      "形状: a 半长轴 (决定轨道大小与周期)、e 偏心率 (0=圆, 越接近 1 越扁; 也常用 q=a(1-e) 近日距代替 a)。",
      "指向: i 轨道倾角 (轨道面相对黄道面的夹角)、Ω 升交点经度 (轨道面与黄道面交线的方向)、ω 近日点幅角 (近日点在轨道面内的方位)。",
      "相位: M 平近点角 (天体在轨道上的位置, 必须配合历元使用)。本系统事件记录只带 {a,e,i,Ω,ω} 五根数, M 由遭遇时刻几何反解; 所有根数在存储前都已归一化到 J2000 历元。",
    ],
  },
  {
    id: "anomaly",
    title: "三种近点角 (M / E / ν)",
    category: "orbit",
    keywords: [
      "mean anomaly",
      "eccentric anomaly",
      "true anomaly",
      "近点角",
      "开普勒方程",
    ],
    summary:
      "平近点角随时间均匀增长, 真近点角才是真实位置, 偏近点角是两者的桥梁。",
    body: [
      "真近点角 ν 是天体相对近日点的真实夹角; 平近点角 M 是假想匀速运动的角度, 随时间线性增长, 便于星历计算; 偏近点角 E 是几何辅助量。",
      "三者由开普勒方程 M = E − e·sinE 联系。这个方程没有解析解, 只能迭代求数值解——前端云带约 1.7 万粒子就是分帧迭代解开普勒方程来更新位置的。",
    ],
  },
  {
    id: "two-body-vs-nbody",
    title: "二体解析解与全摄动数值解",
    category: "orbit",
    keywords: ["开普勒", "二体", "摄动", "N体", "星历", "烘焙"],
    summary: "开普勒椭圆是近似; 精确位置需要把行星引力都算进去的数值积分。",
    body: [
      "二体问题 (只考虑太阳引力) 有解析解: 轨道是固定椭圆, 位置由六根数直接算出, 速度快、足够画背景云带。",
      "但真实太阳系里行星 (尤其木星) 的引力不断扰动小行星轨道, 长期累积后二体解会明显偏离。本系统对重点天体 (PHA + 命名清单) 用 JPL Horizons 的全摄动解离线烘焙成采样星历, 前端按三次 Hermite 插值取任意时刻位置, 误差远小于 1 公里。",
      '事件详情页的"N 体推演"则是在线数值积分: 以烘焙星历网格点或 SBDB 根数为初值, 在太阳+八大行星+月球的摄动场中用 DOP853 算法积分。',
    ],
  },
  {
    id: "period",
    title: "轨道周期与平运动",
    category: "orbit",
    keywords: ["period", "周期", "开普勒第三定律"],
    summary: "周期只由半长轴决定: T(年) = a^1.5 (a 以 AU 计)。",
    body: [
      "开普勒第三定律: 轨道周期的平方正比于半长轴的立方。以 AU 和年为单位时近似 T = a^1.5——a=1 AU 周期 1 年, a=2.8 AU 的主带天体周期约 4.7 年。",
      "本系统画轨道线时, 正是按当前半长轴算出一个恒星周期, 在该周期内采样 361 个位置点连线——这样即使是有摄动的非闭合轨迹也能正确绘制。",
    ],
  },
  {
    id: "moid",
    title: "MOID 最小轨道交会距离",
    category: "orbit",
    keywords: ["minimum orbit intersection distance", "轨道交会"],
    summary: "两条轨道之间的最小几何距离, 是 PHA 判据的一半。",
    body: [
      'MOID (Minimum Orbit Intersection Distance) 是小行星轨道与地球轨道作为两条空间曲线的最小距离。它不考虑天体当前在哪里, 只反映"两条轨道有多接近"。',
      "MOID ≤ 0.05 AU (约 750 万公里) 是潜在危险天体 (PHA) 判据的轨道部分; 另一半是尺寸 (H≤22, 约 140 米)。注意 MOID 小不代表会发生接近——还需要天体恰好运行到交点附近, 那由 CAD 接近数据回答。",
    ],
  },

  /* ---------------- 巡天与载荷 ---------------- */
  {
    id: "boresight-fov-footprint",
    title: "光轴、视场、光锥与天区足迹",
    category: "observation",
    keywords: ["boresight", "field of view", "FOV", "光锥", "天区", "footprint"],
    summary: "光轴是望远镜朝向，视场是能同时成像的角范围，足迹是一次曝光在天球上的覆盖。",
    body: [
      "光轴 (boresight) 是望远镜视线的中心方向；视场 (field of view, FOV) 是探测器一次能够成像的角宽和角高。三维场景把光轴和视场边界画成光锥，只是帮助理解当前指向的几何辅助线，并不是卫星向外发射的光束。",
      "天区是天球上的方向区域，不是固定距离处的一块实体平面。一次有效曝光把视场投影到天球上形成天区足迹；多个足迹随时间拼接才构成覆盖图。光锥扫过某处只说明视线经过，只有有效曝光才应计入已观测覆盖。",
      "本系统在计划姿态存在时显示光锥，曝光阶段高亮并进行视场内几何样本计数，曝光结束后记录足迹。这个计数不包含亮度、信噪比和图像处理，因此不能直接称为探测或发现。",
    ],
    link: { to: "/metrics", label: "查看观测层技术口径" },
  },
  {
    id: "exposure-integration-readout",
    title: "曝光、积分与读出",
    category: "observation",
    keywords: ["exposure", "integration", "readout", "曝光", "积分", "读出", "探测器"],
    summary: "曝光是探测器积累光信号的时段，读出是把测量结果转为数据的后续过程。",
    body: [
      "曝光 (Exposure) 是探测器接收光子并积累信号的时间段；积分时间越长，通常越有利于积累弱信号，但目标视运动、背景、饱和、宇宙线和姿态抖动都会限制有效积分。红外阵列还可能在一次曝光中多次采样并拟合信号斜率，而不只是像普通相机那样简单开关快门。",
      "读出 (readout) 是把探测器上的电荷或采样结果转换、整理并保存为数据。读出可能产生死时间，也可能与下一次积分部分重叠，取决于载荷设计；仿真不能在没有接口依据时假定探测器始终连续曝光。",
      "当前系统把曝光和读出等待分成独立活动：只有 exposure 形成足迹，wait 不重复计算观测。曝光是否最终产生科学数据，还应由后续系统结合几何有效性、灵敏度和质量标志判断。",
    ],
    sources: [
      { label: "NEO Surveyor 载荷与曝光工作方式", url: "https://arxiv.org/html/2310.12918v1#S3" },
    ],
  },
  {
    id: "slew-settle-observe",
    title: "转向—稳定—曝光工作周期",
    category: "observation",
    keywords: ["slew", "settle", "pointing", "转向", "稳定", "驻留", "姿态"],
    summary: "多数凝视式巡天不是边转边拍，而是先转向、再稳定、再完成曝光与读出。",
    body: [
      "转向 (slew) 把光轴从一个天区移到下一个天区；稳定 (settle) 用于消除转向后的姿态误差和结构振动；随后才进入曝光和读出。科学任务会为角速度、角加速度、稳定时间、指向误差和抖动分别设置约束。",
      "三维动画可以在全部阶段显示光锥，因为它表达望远镜当时看向哪里；但转向和稳定期间不应自动留下已观测足迹。把‘指向存在’与‘有效曝光’分开，是避免把动画误读成观测数据的关键。",
      "当前仿真按姿态四元数回放上述活动，并做太阳伸长角上下限、地球规避区和星历覆盖检查；它是几何与时序仿真，不是完整的姿态控制、热控或飞行软件验证。",
    ],
  },
  {
    id: "l1-observation-exclusions",
    title: "L1 观测约束：盘面遮挡与规避区",
    category: "observation",
    keywords: ["太阳规避", "地球规避", "地球遮挡", "背日侧", "太阳伸长角", "杂散光", "L1"],
    summary: "盘面遮挡是几何事实，规避区是叠加在几何上的仪器指向假设；地球方向不能简单当作反太阳方向。",
    body: [
      "站在卫星位置看天空，太阳和地球各占一个随距离变化的视圆盘。日地盘面遮挡区只描述这些方向被实体遮住，不能代替载荷为防杂散光、热控等设置的更大规避角。地球规避区必须以当时卫星到地球的实际方向为中心；太阳伸长角上限对应的球冠则以反太阳方向为中心，L1 晕轨道上两者并非严格重合。",
      "太阳伸长角是指向与太阳视方向之间的夹角。NEO Surveyor 公开资料给出的仪器可工作范围为 45°–125°，其巡天区域是更小的 45°–120° 纵向范围。按当前仿真配置，45° 内为太阳侧规避区；伸长角超过 125° 等价于反太阳方向周围 55° 的球冠。这只是该任务的指向范围参考，不是 NASA 对所有 L1 卫星制定的通用背日禁区，更不是地球规避区。",
      "本系统地球规避半角 = 地球视半径 + 5°。5° 是为了演示杂散光留出的可替换仿真余量，不是 NASA 的 L1 任务指标。图层显示光轴方向的球冠，计划几何校验还会叠加矩形视场半对角线形成保守包络；目前按离散时间检查，并不构成真实任务的飞行可执行性证明。",
    ],
    sources: [
      { label: "NEO Surveyor 仪器可工作区间与巡天区域", url: "https://arxiv.org/html/2310.12918v1#S2" },
      { label: "NASA NEO 巡天研究：规避区与伸长角", url: "https://www.nasa.gov/wp-content/uploads/2015/12/aoa_neo_report_final_11082018_0.pdf" },
    ],
    link: { to: "/metrics", label: "查看 L1 指向约束技术口径" },
  },
  {
    id: "survey-modes",
    title: "阶梯凝视与连续扫描",
    category: "observation",
    keywords: ["step and stare", "continuous scanning", "扫描律", "巡天模式", "Gaia", "Euclid"],
    summary: "巡天可以长期连续运行，但望远镜的瞬时工作方式可能是分区驻留，也可能是连续扫过天球。",
    body: [
      "阶梯凝视 (step-and-stare) 反复执行‘转向—稳定—曝光—读出’，适合面阵成像和按天区排程。NEO Surveyor 的公开方案采用高度重复的访问与复访结构；Euclid 也属于阶梯凝视式大面积巡天。",
      "连续扫描让卫星保持自旋或按扫描律匀速运动，天体像连续穿过焦平面，探测器时序和地面处理必须补偿像移。Gaia 的名义扫描律由约 6 小时自旋、约 63 天进动和绕日运动共同组成。",
      "‘任务连续执行’是任务级概念，不等于每一秒都在积分。采用哪种模式由科学目标、探测器、姿态控制、热控与通信共同决定；卫星位于 L1 或 L2 本身并不能推出扫描策略，更不能仅凭听说的‘Z 字形’认定真实扫描律。",
    ],
    sources: [
      { label: "NEO Surveyor 概念运行", url: "https://arxiv.org/html/2310.12918v1#S3" },
      { label: "ESA Gaia 扫描律", url: "https://gea.esac.esa.int/archive/documentation/GEDR3/Introduction/chap_cu0int/cu0int_sec_mission/cu0int_ssec_scanning_law_concepts.html" },
      { label: "ESA Euclid 科学需求文档", url: "https://sci.esa.int/documents/33220/36137/1567257215944-Euclid_SciRD_DEM-SA-DC-0001_4_0_2010-03-22.pdf" },
    ],
  },
  {
    id: "visit-dither-revisit",
    title: "曝光、抖动、访问与复访",
    category: "observation",
    keywords: ["visit", "dither", "revisit", "tracklet", "访问", "复访", "抖动", "轨迹段"],
    summary: "这些词对应不同时间尺度：单次曝光、同一访问内的小偏移、多时刻复访，以及移动目标关联。",
    body: [
      "抖动 (dither) 是同一次访问内的小幅指向偏移，用来覆盖探测器缝隙、改善采样并抑制坏像元；访问 (Visit) 是针对一个天区组织的一组曝光；复访 (revisit) 是隔一段时间再次观测同一天区。三者不能混为同一个动作。",
      "对于移动目标，复访提供不同时间的天球位置。处理系统把相容的检测点关联成短弧轨迹段 (tracklet)，再与其他轨迹段和历史观测联合确定轨道。仅在三维场景里看见某颗小行星落入光锥，并不足以宣布发现。",
      "NEO Surveyor 公开方案中，一个 Visit 含 6 次六边形抖动曝光，同一天区约 6–9 小时内覆盖 4 次。当前系统保留‘多曝光、多复访’结构，但使用自定义时长和局部网格，而且尚未模拟抖动与图像检测链路。",
    ],
    sources: [
      { label: "NEO Surveyor 巡天节奏与数据处理", url: "https://arxiv.org/html/2310.12918v1#S3" },
    ],
  },
  {
    id: "field-of-view-regard",
    title: "视场、可指向区与太阳规避",
    category: "observation",
    keywords: ["field of regard", "solar elongation", "视场", "可指向区", "太阳规避", "L1"],
    summary: "单次视场很小，可指向区是满足遮光、热控和任务约束后允许光轴进入的更大天区。",
    body: [
      "视场 (field of view) 描述一次成像覆盖多大角度；可指向区 (field of regard) 描述望远镜在给定时刻允许指向哪些方向。太阳规避角、遮光罩、热控、地月遮挡、通信和姿态能力都会限制可指向区。",
      "日地 L1 为近太阳方向巡天提供较稳定的热环境和观测几何，但它只是任务轨道条件。真实系统仍需随时间计算太阳、地球和月球方向，并验证整个视场边界，而不能只检查光轴中心。",
      "当前系统采用 45°–125° 的仪器太阳角包络，巡天示例使用距太阳 45°–120°、黄纬 ±40° 的区域；这些区域参考 NEO Surveyor 公开口径，视场和活动时长则是明确标注的自定义仿真假设。",
    ],
    sources: [
      { label: "NEO Surveyor 视场与可指向区", url: "https://arxiv.org/html/2310.12918v1#S2" },
    ],
  },
  {
    id: "simulation-observation-boundary",
    title: "计划、仿真、执行与探测的边界",
    category: "observation",
    keywords: ["simulation", "execution", "detection", "计划", "仿真", "执行", "探测", "发现"],
    summary: "渲染系统可以忠实回放计划与几何，但不能把计划足迹冒充真实遥测或科学发现。",
    body: [
      "计划描述准备做什么；仿真根据模型预测将发生什么；执行反馈说明卫星实际上做了什么；科学数据处理才回答图像中检测到了什么。四类数据必须保留来源、版本、时标和状态，不能在展示层静默互换。",
      "当前 L1 星没有对应的真实在轨卫星，轨道采用受验证的日地 CR3BP 周期解随真实日地星历映射，观测计划由本系统示例生成器提供。界面中的‘仿真曝光’和‘几何样本’是刻意限定的术语，不等同于载荷遥测、候选检测或新天体发现。",
      "当前背景巡天示例按计划日只生成太阳一侧的局部网格，相邻日切换到另一侧，并按日期轮换黄纬带。这样表达的是长期双侧覆盖，而不是同一天执行两块机械镜像天区；正式天区仍应由外部策略系统决定。",
      "未来专用策略系统接入时，应通过同一计划契约输入姿态、时标、活动和仪器参数；渲染器只负责校验、回放和显示，不在渲染循环中重新制定扫描策略。",
    ],
    link: { to: "/metrics", label: "查看观测数据流与当前参数" },
  },

  /* ---------------- 小行星家族 ---------------- */
  {
    id: "neo-pha",
    title: "NEO 与 PHA",
    category: "family",
    keywords: ["近地天体", "潜在危险天体", "potentially hazardous"],
    summary: "近日距 ≤1.3 AU 的是近地天体; 其中够大又够近的是潜在危险天体。",
    body: [
      "NEO (Near-Earth Object, 近地天体): 近日距 q ≤ 1.3 AU, 轨道能进入地球附近空间的小行星 (和彗星)。",
      'PHA (Potentially Hazardous Asteroid, 潜在危险天体): 在 NEO 中进一步满足 MOID ≤ 0.05 AU 且 H ≤ 22 (约 ≥140 米)。PHA 不等于"会撞地球", 而是"值得长期跟踪"的观察名单。',
      '本系统事件详情的风险分析结论中, "直径满足 PHA 尺寸判据"即指由 H 估算的直径超过 140 米; 重点星历烘焙的目标集也包含全部 PHA。',
    ],
  },
  {
    id: "neo-groups",
    title: "Atira / Aten / Apollo / Amor 分族",
    category: "family",
    keywords: ["阿登", "阿波罗", "阿莫尔", "轨道分类"],
    summary: "按半长轴与近日距把近地小行星分成四个轨道族。",
    body: [
      "Amor: 近日距 1.017–1.3 AU, 在地球轨道外侧但不穿越; Apollo: a ≥ 1 AU 且近日距 ≤ 1.017 AU, 穿越地球轨道; Aten: a < 1 AU 且远日距 ≥ 0.983 AU, 同样穿越; Atira: 轨道完全在地球轨道以内 (远日距 < 0.983 AU)。",
      '分族名称来自各族的代表小行星。事件中心和天体详情中的"轨道分类"字段即此分族。',
    ],
  },
  {
    id: "belt-populations",
    title: "主带 / Hilda / 特洛伊 / 柯伊伯带",
    category: "family",
    keywords: ["main belt", "trojan", "kuiper", "木星", "云带"],
    summary: "场景中云带粒子的四个族群, 对应不同的轨道区域与动力学机制。",
    body: [
      "主带: 火星与木星之间 (约 2.1–3.3 AU), 小行星的主体; Hilda 族: 与木星 3:2 轨道共振 (约 3.9 AU); 特洛伊: 与木星共轨, 聚集在 L4/L5 拉格朗日点附近 (5.2 AU); 柯伊伯带: 海王星之外 (30 AU 以上) 的冰质天体环带。",
      "本系统的云带粒子来自 MPC MPCORB.DAT 真实轨道数据, 按族群分层抽样 (主带 14000 / NEO 1600 / Hilda 450 / 特洛伊 450 / 柯伊伯 700), 不是程序随机生成。",
    ],
  },

  /* ---------------- 事件与风险 ---------------- */
  {
    id: "cad",
    title: "CAD 近地接近数据",
    category: "risk",
    keywords: ["close approach", "接近", "遭遇"],
    summary: "JPL 发布的未来近地接近预报: 谁、何时、多近、多快。",
    body: [
      "CAD (Close Approach Data) 是 JPL 根据最新轨道解算出的近地接近事件表, 每条含遭遇时刻、名义距离及 3σ 上下界、相对速度和 H 星等。本系统每 6 小时全量同步一次 (距离 ≤ 20 LD)。",
      "注意: CAD 随轨道解更新——新观测可能让预报距离显著变化, 已不成立的接近会被 JPL 移除。因此 CAD 事件的根数展示只是几何拟合, 权威结论永远以 JPL 当前解为准。",
    ],
  },
  {
    id: "flyby-impact",
    title: "飞掠与撞击事件",
    category: "risk",
    keywords: ["flyby", "impact", "撞击"],
    summary: "事件的两种类型: 安全掠过 vs 进入大气/触地。",
    body: [
      "飞掠 (flyby): 天体以一定距离掠过地球, 关键参数是遭遇距离与相对速度; 撞击 (impact): 天体进入大气或触地, 关键参数另有落点经纬度、爆炸高度、TNT 当量与冲击波范围。",
      "事件中心的危险等级由服务端按类型、距离、直径统一分档: 撞击事件与极近距离飞掠为 critical/high, 远距离无害飞掠为 low。",
    ],
  },
  {
    id: "bplane",
    title: "B 平面 (ξ/ζ)",
    category: "risk",
    keywords: ["b-plane", "瞄准面", "遭遇几何"],
    summary: '垂直于来流方向的"瞄准平面": 撞击分析的标准坐标。',
    body: [
      'B 平面是过地心、垂直于小行星渐近来流方向的平面。天体相对地球的轨迹在这个平面上的投影点 (ξ, ζ) 就是"瞄准点", 其到原点 (地心) 的距离 |B| 决定遭遇有多近。',
      "本系统风险分析中, 名义轨迹与 12 个 σ 扰动样本各自传播到遭遇窗口后都投影到 B 平面, 样本散布构成二维高斯, 据此计算撞击概率与 3σ 概率椭圆。",
    ],
  },
  {
    id: "covariance",
    title: "轨道协方差与 3σ 不确定性",
    category: "risk",
    keywords: ["covariance", "不确定度", "sigma", "不确定性管"],
    summary: "轨道解不只是一个点估计, 还带着刻画误差范围的协方差矩阵。",
    body: [
      "轨道由有限观测拟合而来, 必然有误差。SBDB 在给出标称根数的同时给出 6×6 协方差矩阵, 描述根数误差的大小与相关性。把协方差传播到未来, 就得到位置的不确定性范围。",
      "本系统用 Cholesky 分解生成 12 个 ±√6σ 缩放 sigma 点, 与名义轨迹在同一 N 体摄动场中传播; 各时间截面上样本的二阶矩经特征分解得到椭圆截面, 连成 3σ 不确定性管——含义是真实轨迹约 99.7% 概率位于管内 (一阶线性近似, 协方差历元 10 年内有效)。",
    ],
  },
  {
    id: "sentry",
    title: "Sentry 与虚拟撞击体",
    category: "risk",
    keywords: ["sentry", "virtual impactor", "撞击监测"],
    summary: "JPL 的自动撞击监测系统, 远期撞击风险的权威来源。",
    body: [
      "Sentry 是 JPL CNEOS 的自动碰撞监测系统: 对每个已知 NEO, 沿轨道不确定性散布数千个虚拟撞击体 (VI), 扫描未来 100 年内的撞击可能, 汇总撞击概率、都灵/巴林指数。",
      "本系统每 12 小时同步 Sentry 汇总数据。局部协方差线性方法只覆盖协方差历元后 10 年内的近遇; 更远的远期风险请以 Sentry 官方解算为准。",
    ],
  },
  {
    id: "torino",
    title: "都灵指数",
    category: "risk",
    keywords: ["torino scale", "都灵等级"],
    summary: "0–10 的整数等级, 向公众传达撞击危险程度。",
    body: [
      "都灵指数 (Torino Scale) 综合撞击概率与动能 (即破坏力) 给出 0–10 的整数等级: 0 = 无威胁 (概率极低或太小烧蚀殆尽), 1 = 常规监测, 2–4 = 值得关注, 5–7 = 威胁升高需要应对规划, 8–10 = 确定的碰撞, 破坏从局部到全球。",
      "历史上绝大多数被评为 1 级以上的天体, 都在后续观测中降为 0——观测越多, 轨道越准, 虚警自然消除。",
    ],
  },
  {
    id: "palermo",
    title: "巴林指数",
    category: "risk",
    keywords: ["palermo scale", "巴勒莫"],
    summary: "对数刻度的撞击风险度量, 0 代表与背景风险相当。",
    body: [
      '巴林指数 (Palermo Scale) 比较某次潜在撞击与"随机背景撞击" (同等能量事件的长期平均发生率) 的相对风险, 取对数。PS = 0 表示与背景相当, PS < 0 表示低于背景, PS > 0 才是值得认真对待的威胁。',
      "与都灵指数面向公众不同, 巴林指数面向专业人员, 能区分不同能量事件的相对优先级。本系统同步 Sentry 的累计与最大巴林指数。",
    ],
  },
  {
    id: "gravity-focus",
    title: "引力聚焦与有效撞击半径",
    category: "risk",
    keywords: ["gravitational focusing", "撞击半径"],
    summary: '地球引力会"弯折"来流, 使实际撞击截面比地球物理半径更大。',
    body: [
      '小行星接近地球时被引力加速、轨迹向地心弯曲, 因此即使瞄准点略偏离地球边缘也可能撞上。等效地, 地球在 B 平面上呈现一个比物理半径更大的"有效撞击半径": R_eff = R⊕·√(1 + v_esc²/v∞²), 其中 v∞ 是渐近相对速度。',
      "v∞ 越小引力聚焦越显著。本系统计算撞击概率时, 统计的是 B 平面高斯样本落入有效撞击圆 (而非物理圆) 的比例。",
    ],
  },

  /* ---------------- 系统指南 ---------------- */
  {
    id: "guide-data",
    title: "系统的数据从哪来",
    category: "guide",
    keywords: ["数据源", "SBDB", "Horizons", "MPC", "指标"],
    summary: "全部来自 JPL/MPC 公开接口, 离线烘焙成种子库随系统打包。",
    body: [
      "小行星根数与协方差来自 JPL SBDB, 接近事件来自 JPL CAD, 撞击风险来自 JPL Sentry, 云带样本来自 MPC MPCORB.DAT, 行星与重点小行星星历由 SPICE 内核与 JPL Horizons 离线烘焙。",
      "技术指标页有完整的数据源清单、加工链路和实时同步状态, 是了解系统数据层、计算层、逻辑层的入口。",
    ],
    link: { to: "/metrics", label: "查看技术指标页" },
  },
  {
    id: "guide-timeline",
    title: "时间轴与坐标系操作",
    category: "guide",
    keywords: ["时间轴", "坐标系", "操作", "相机", "日心", "地心"],
    summary: '拖时间轴看未来与过去; 四个坐标系决定"以谁为中心"。',
    body: [
      "底部时间轴驱动仿真时钟: 空格播放/暂停, 拖动可快进到任意事件时刻。场景交互: 左键旋转、滚轮缩放、右键平移; 点空白取消选中, 再点当前坐标系按钮回标准机位。",
      "四个坐标系: 日心黄道 (太阳系全景)、地心 (近地事件分析)、L1 点 (巡天视角)、伴飞目标 (跟随选中天体)。换坐标系不重建场景, 只是世界原点与朝向的整体变换。",
    ],
  },
  {
    id: "guide-replay",
    title: "事件仿真怎么看",
    category: "guide",
    keywords: ["仿真", "回放", "事件专题"],
    summary: "进入事件专题后, 时间轴自动收窄到遭遇窗口, 红色轨道即事件天体。",
    body: [
      "在事件中心点击任意事件进入专题: 系统按事件参数拟合出一条精确穿过遭遇点的轨道 (红色), 时间轴自动收窄到遭遇前后窗口, 仿真状态机按 接近→撞击/掠过→后果 推进。",
      "拟合轨道是几何构造 (由五根数与遭遇几何反解), 用于直观还原场景; 命中烘焙星历的重点天体, 其位置以真实星历为准。",
    ],
    link: { to: "/events", label: "前往事件中心" },
  },
  {
    id: "guide-propagate",
    title: "N 体推演是什么",
    category: "guide",
    keywords: ["推演", "积分", "propagate"],
    summary: "对单条事件弧做在线全摄动数值积分, 得到比拟合椭圆更真实的轨迹。",
    body: [
      '事件详情页的"N 体推演"按钮会触发后端在线积分: 以烘焙星历网格点 (或 SBDB 根数) 为初值, 在太阳+八大行星+月球的引力场中用 DOP853 算法积分, 输出青绿色轨迹弧。',
      "它与红色拟合轨道互为对照: 拟合轨道保证穿过遭遇点, N 体弧保证动力学真实; 两者分叉程度本身就是轨道确定性的直观指示。",
    ],
  },
  {
    id: "guide-risk",
    title: "风险分析结论怎么读",
    category: "guide",
    keywords: ["风险", "分析", "B平面", "撞击概率"],
    summary:
      '名义 B 平面给"会多近", 不确定性管给"有多准", 撞击概率给"多危险"。',
    body: [
      "三个层次: 名义值 (最近距离/相对速度) 来自标称轨道; 不确定性 (3σ 管与 B 平面概率椭圆) 来自 SBDB 协方差传播; 撞击概率是协方差高斯在有效撞击圆上的积分。",
      "判读顺序建议: 先看名义距离是否值得关注, 再看不确定性管是否罩住地球 (罩住才谈概率), 最后对照 Sentry 官方指数。注意本地概率是一阶线性近似, 仅协方差历元 10 年内有效。",
    ],
    link: { to: "/metrics", label: "查看风险分析口径" },
  },
];

/** 空格分词, AND 语义: title 10 / keywords 6 / summary 3 / body 每处 1; 空串返回原顺序 */
export function searchKnowledge(query: string): KnowledgeEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return KNOWLEDGE_ENTRIES;
  const scored: { entry: KnowledgeEntry; score: number }[] = [];
  for (const entry of KNOWLEDGE_ENTRIES) {
    let score = 0;
    let allHit = true;
    for (const term of terms) {
      let s = 0;
      if (entry.title.toLowerCase().includes(term)) s += 10;
      if (entry.keywords.some((k) => k.toLowerCase().includes(term))) s += 6;
      if (entry.summary.toLowerCase().includes(term)) s += 3;
      if (entry.sources?.some((source) => source.label.toLowerCase().includes(term))) s += 2;
      for (const para of entry.body) {
        if (para.toLowerCase().includes(term)) s += 1;
      }
      if (s === 0) {
        allHit = false;
        break;
      }
      score += s;
    }
    if (allHit) scored.push({ entry, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.entry);
}
