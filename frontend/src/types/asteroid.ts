export interface AsteroidRecord {
  name: string
  en: string
  /** SBDB designation; 命中预烘焙星历时前端 astPos 改用 Hermite 插值 */
  des?: string
  /** SBDB 轨道解编号；CAD 风险计算必须与事件使用同一解。 */
  orbitSolutionId?: string | null
  a: number
  e: number
  i: number
  O: number
  w: number
  /** 平近点角 (度, 已归一到 J2000; 二体模型下 M 随时间严格线性, 归一化与从原始历元传播逐点等价) */
  M0: number
  /** 轨道解的密切历元 (JD, SBDB 给出): 分析所需的元信息, 历元越旧开普勒外推可信度越低 */
  epochJd?: number
  diam: number
  cls: string
  spinH?: number
}

export interface GroundStation {
  name: string
  country: string
  lat: number
  lon: number
  type: string
  desc: string
}

export interface CloudConfig {
  beltCount: number
  neoCount: number
  hildaTrojanCount: number
  kuiperCount: number
}

/** 云带单颗粒子轨道种子 (程序化生成或 MPCORB 真实抽样共用) */
export interface CloudSeed {
  pop: 'main_belt' | 'neo' | 'hilda' | 'trojan' | 'kuiper'
  a: number
  e: number
  i: number
  om: number
  w: number
  /** J2000 历元平近点角 (度) */
  m0: number
  /** 估算直径 km (真实样本由 H 星等换算) */
  diam: number
  /** 可读编号/名称 (如 '(1) Ceres'、'2014 KP4'); 程序化种子无 */
  des?: string
}
