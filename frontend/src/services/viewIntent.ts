/* ============================================================================
 * viewIntent.ts — 路由视角意图表 (视角管理三层模型 · 第一层)
 *
 * 视角三层概念正交:
 *   坐标系 frame (世界中心是谁) / 相机 camera (站位与注视点) / 选择 (关注谁)。
 * 每个路由声明自己的默认视角意图, 路由切换时由 RouteViewIntent 统一应用
 * (页内 FrameSwitcher 手动切换属第二层"用户覆盖", 仅在当前页面有效;
 *  仿真激活期间属第三层"高优接管", 意图表跳过不干预, 仿真结束后重放)。
 * 跨页视角残留 (如地心系跳到事件中心) 由本表兜底恢复, 各页面不再自行
 * setFrame/setMode —— 视角写入方收敛为: 意图表 / FrameSwitcher / 仿真链路 /
 * 显式用户按钮 (跳转事件时刻等) 四类。
 * ========================================================================== */

import type { FrameType } from '@/types/scene'
import type { ViewMode } from '@/store/uiStore'

export interface ViewIntent {
  /** 目的地默认坐标系 */
  frame: FrameType
  /** 目的地默认视图模式 (驱动监测内容层显隐), 不声明则不动 */
  mode?: ViewMode
  /** 进入后自动聚焦跟随选中目标 (小行星专题: 相机吸附目标天体) */
  follow?: boolean
  /**
   * 相机落位口径:
   *  reset — 进入即回该坐标系标准画面 (列表/总览页的语义就是"标准画面",
   *          修掉"从推近后的详情页返回总览却仍是特写");
   *  keep  — 保持当前机位 (详情页的机位由跟随/预览取景决定, 不做额外复位)。
   * 仅在 frame 未变化时生效: 换帧本身就自带相机复位。
   */
  pose?: 'reset' | 'keep'
}

/** 前缀匹配表: 顺序即优先级 (先匹配先生效) */
const PREFIX_INTENTS: [prefix: string, intent: ViewIntent][] = [
  ['/situation/l1', { frame: 'l1', mode: 'survey', pose: 'reset' }],   // 含 l1/task/:id 子路由
  ['/situation/ground', { frame: 'geo', mode: 'ground', pose: 'reset' }],
  ['/situation', { frame: 'helio', mode: 'overview', pose: 'reset' }], // overview 及兜底
  ['/asteroid/', { frame: 'helio', mode: 'overview', follow: true, pose: 'keep' }],
  ['/station/', { frame: 'geo', mode: 'ground', pose: 'keep' }],
  ['/obs-task/', { frame: 'geo', mode: 'ground', pose: 'keep' }],
  ['/events/', { frame: 'helio', mode: 'overview', pose: 'keep' }],    // 事件专题: 机位由预览取景决定
  ['/events', { frame: 'helio', mode: 'overview', pose: 'reset' }],    // 事件中心列表
  ['/metrics', { frame: 'helio', mode: 'overview', pose: 'reset' }],   // 技术指标说明页
  ['/knowledge', { frame: 'helio', mode: 'overview', pose: 'reset' }], // 知识库
  ['/search', { frame: 'helio', mode: 'overview', pose: 'reset' }],
]

/** 路由 → 视角意图; 未声明的路由返回 null (不动视角) */
export function resolveIntent(pathname: string): ViewIntent | null {
  for (const [prefix, intent] of PREFIX_INTENTS) {
    if (pathname.startsWith(prefix)) return intent
  }
  return null
}
