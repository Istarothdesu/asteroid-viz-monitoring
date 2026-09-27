import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { resolveIntent } from '@/services/viewIntent'
import { useFrameStore } from '@/store/frameStore'
import { useCameraStore } from '@/store/cameraStore'
import { useUIStore } from '@/store/uiStore'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useSelectionStore } from '@/store/selectionStore'
import { isSelectionCompatible } from '@/services/viewPolicy'
import { useSimStore } from '@/store/simStore'
import { defaultSimulationRange, nowJD } from '@/utils/orbital/time'

/**
 * 路由视角同步器 (渲染 null, 挂在 BrowserRouter 内)。
 *
 * 路由切换 = 应用目的地页面的默认视角意图; 页内 FrameSwitcher 手动切换只在当前页有效。
 * 视角写入方由此收敛, 各页面 Provider 只写"选中态", 不再各自 setFrame/setMode。
 *
 * 仿真期间让出相机控制；同页退出由仿真会话恢复原状态，跨页退出应用目的地意图。
 *
 * following 是派生态 (followRequest && selected), 因此本 effect 与页面 Provider
 * 写入选中态的先后顺序无关 —— 不依赖 React effect 执行时序。
 */
export default function RouteViewIntent() {
  const { pathname } = useLocation()
  const replayActive = useEventSimulationStore((s) => !!s.activeEvent)

  const previous = useRef({ pathname, replayActive })
  useEffect(() => {
    const last = previous.current
    previous.current = { pathname, replayActive }
    if (replayActive) {
      if (last.pathname !== pathname) {
        useEventSimulationStore.getState().stopSimulation(false)
        // 离开专题时不带走其历史时间窗；有专属时间窗的目的地随后由页面设置。
        const [jdMin, jdMax] = defaultSimulationRange(), jd = nowJD()
        useSimStore.setState({ jd, jdMin, jdMax, timelineCenterJd: jd, timelineScaleDays: 30 })
        useSelectionStore.getState().clearSelection()
      }
      else return
    }
    if (last.replayActive && !replayActive && last.pathname === pathname) return
    const intent = resolveIntent(pathname)
    if (!intent) return

    const fs = useFrameStore.getState()
    const cam = useCameraStore.getState()
    if (intent.frame !== fs.frame) {
      // 换帧自带相机复位 (SceneManager._setFrame), 无需再请求 reset
      fs.setFrame(intent.frame)
    } else if (intent.pose === 'reset') {
      /* frame 未变但页面语义要求标准画面: 如从推近后的详情页返回总览 */
      cam.requestReset()
    }

    if (intent.mode && useUIStore.getState().mode !== intent.mode) {
      useUIStore.getState().setMode(intent.mode)
    }

    const nextMode = intent.mode ?? useUIStore.getState().mode
    const selection = useSelectionStore.getState()
    if (!isSelectionCompatible(nextMode, selection.selected)) {
      selection.clearSelection()
    }

    cam.setFollowRequest(!!intent.follow)
  }, [pathname, replayActive])

  return null
}
