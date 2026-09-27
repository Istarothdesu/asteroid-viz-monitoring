import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SceneCanvas from './components/scene/SceneCanvas'
import RouteViewIntent from './components/RouteViewIntent'
import TopBar from './components/layout/TopBar'
import SituationLayout from './pages/situation/SituationLayout'
import OverviewLeftPanel from './pages/situation/overview/OverviewLeftPanel'
import L1LeftPanel from './pages/situation/l1/L1LeftPanel'
import L1TaskDetailPanel from './pages/situation/l1/L1TaskDetailPanel'
import GroundLeftPanel from './pages/situation/ground/GroundLeftPanel'
import { LoadingOverlay } from './components/ui/Loading'
import { useDataStore } from './store/dataStore'
import { useSimEventStore } from './store/simEventStore'
import { useUIStore } from './store/uiStore'
import './index.css'

const AsteroidLayout = lazy(() => import('./pages/asteroid/AsteroidLayout'))
const StationLayout = lazy(() => import('./pages/station/StationLayout'))
const ObsTaskLayout = lazy(() => import('./pages/obs-task/ObsTaskLayout'))
const SearchLayout = lazy(() => import('./pages/search/SearchLayout'))
const EventsPage = lazy(() => import('./pages/events/EventsPage'))
const EventDetailLayout = lazy(() => import('./pages/events/EventDetailLayout'))
const CreateSimEventLayout = lazy(() => import('./pages/events/CreateSimEventLayout'))
const MetricsPage = lazy(() => import('./pages/metrics/MetricsPage'))
const KnowledgeLayout = lazy(() => import('./pages/knowledge/KnowledgeLayout'))

export default function App() {
  const loading = useUIStore(s => s.loading)

  useEffect(() => {
    // 拉取后端真实数据 (SBDB/CAD/MPCORB) 与推演事件目录; 失败静默降级到静态数据
    const { load, showLoading, hideLoading } = { ...useDataStore.getState(), ...useUIStore.getState() }
    showLoading('正在同步轨道数据…', 'SBDB / CAD / MPCORB', true)
    /* 推演事件在启动期一并拉取: 旧版本的 localStorage 数据要趁这次搬运入库,
       否则事件中心会看不到用户此前录入的推演事件 */
    void Promise.allSettled([load(), useSimEventStore.getState().load()]).finally(hideLoading)
  }, [])

  return (
    <>
      <BrowserRouter>
        {/* 路由视角同步器 (渲染 null): 路由切换即应用目的地页面的默认视角意图 */}
        <RouteViewIntent />
        {/* 容器不拦截事件, 空白区域鼠标直达底层常驻的三维场景 */}
        <div className="relative flex flex-col size-full overflow-hidden pointer-events-none" style={{ background: 'var(--bg)' }}>
          {/* 三维场景 App 层常驻: 态势/专题等布局切换不重建 WebGL */}
          <SceneCanvas />
          {/* 顶栏顶层常驻: 各模块布局不再各自渲染 */}
          <div className="relative z-40 shrink-0">
            <TopBar />
          </div>
          <div className="relative min-h-0 flex-1">
          <Suspense fallback={null}>
            <Routes>
              {/* 实时态势: 一级路由, 左栏随子路由切换 */}
              <Route path="/situation" element={<SituationLayout />}>
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<OverviewLeftPanel />} />
                <Route path="l1" element={<L1LeftPanel />} />
                <Route path="l1/task/:taskId" element={<L1TaskDetailPanel />} />
                <Route path="ground" element={<GroundLeftPanel />} />
              </Route>
              {/* 小行星专题: 左栏详情 + 常驻三维场景 + 时间轴推演 */}
              <Route path="/asteroid/:idx" element={<AsteroidLayout />} />
              {/* 监测站专题: 双浮动列详情 + 单站聚焦三维推演 */}
              <Route path="/station/:idx" element={<StationLayout />} />
              {/* 观测任务专题: 任务详情 + 窗口推演与仿真模拟 */}
              <Route path="/obs-task/:taskId" element={<ObsTaskLayout />} />
              {/* 全局检索: 左列搜索框+结果列表, 右列选中结果详情与专题入口 */}
              <Route path="/search" element={<SearchLayout />} />
              {/* 事件中心: 全源汇聚列表 + 事件专题 (主题色随危险等级) */}
              <Route path="/events" element={<EventsPage />} />
              <Route path="/events/:key" element={<EventDetailLayout />} />
              <Route path="/events/create-sim" element={<CreateSimEventLayout />} />
              {/* 技术指标: 数据/计算/逻辑/观测四层结构说明 + 实时同步指标 */}
              <Route path="/metrics" element={<MetricsPage />} />
              {/* 知识库: 天文常识静态条目 + 页内检索 */}
              <Route path="/knowledge" element={<KnowledgeLayout />} />
              <Route path="*" element={<Navigate to="/situation/overview" replace />} />
            </Routes>
          </Suspense>
          </div>
        </div>
      </BrowserRouter>
      {/* 全局加载遮罩 (数据同步/仿真拟合等耗时操作); 首屏同步时场景未就绪,
          opaque 不透明深底封住底下画面避免白屏透出 */}
      <LoadingOverlay
        visible={loading.visible}
        opaque={loading.opaque}
        text={loading.text}
        subText={loading.subText}
      />
    </>
  )
}
