import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff, Layers3, SlidersHorizontal, X } from 'lucide-react'
import Panel from '@/components/ui/Panel'
import { cn } from '@/lib/utils'
import {
  sceneColorCss,
  type SceneLayerItem,
  type SceneLayerProfile,
  type SceneLayerSection,
  type SceneVisualToken,
} from '@/core/sceneLayers'
import { useLayerStore } from '@/store/layerStore'
import { useEventSimulationStore } from '@/store/eventSimulationStore'
import { useSceneProductStore } from '@/core/sceneProducts/store'
import SceneLayerSettings from './SceneLayerSettings'
import { useSceneLayerSections } from './useSceneLayerSections'

function LayerGlyph({ visual }: { visual: SceneVisualToken }) {
  const color = sceneColorCss(visual.color)
  const translucent = sceneColorCss(visual.color, visual.opacity ?? 0.45)
  if (visual.kind === 'point') {
    return <i className="size-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
  }
  if (visual.kind === 'text') {
    return <i className="w-[18px] shrink-0 text-center text-[9px] not-italic font-semibold" style={{ color }}>Aa</i>
  }
  if (visual.kind === 'area') {
    return (
      <i
        className="h-2.5 w-[18px] shrink-0 rounded-[2px] border"
        style={{ background: visual.filled ? translucent : 'transparent', borderColor: color, boxShadow: `0 0 5px ${translucent}` }}
      />
    )
  }
  return (
    <i
      className="h-[3px] w-[18px] shrink-0 rounded-full"
      style={{
        background: visual.dashed
          ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
          : color,
        boxShadow: `0 0 5px ${translucent}`,
      }}
    />
  )
}

function LayerRow({ item }: { item: SceneLayerItem }) {
  const availability = item.availability ?? 'available'
  const stateKey = item.visibilityKey ?? item.followsVisibilityKey
  const storeEnabled = useLayerStore((state) => stateKey ? state[stateKey] : true)
  const toggleLayer = useLayerStore((state) => state.toggle)
  const enabled = stateKey ? storeEnabled : item.active ?? true
  const interactive = (!!item.visibilityKey || !!item.onToggle) && availability === 'available'
  const detail = availability === 'loading'
    ? '计算中'
    : item.detail ?? (availability === 'unavailable' ? '暂无数据' : null)
  const content = (
    <>
      <span className={cn('relative flex shrink-0 items-center', !enabled && 'after:absolute after:left-[-2px] after:w-[22px] after:h-px after:rotate-[-28deg] after:bg-sky-200/70')}>
        <LayerGlyph visual={item.visual} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] leading-4 text-sky-100/90">{item.label}</span>
        {detail && (
          <span className={cn('block truncate text-[9px] leading-3.5 text-sky-400/55', availability !== 'available' && 'text-amber-300/65')}>
            {detail}
          </span>
        )}
      </span>
      {interactive && (
        <span className="absolute right-1.5 opacity-0 transition-opacity group-hover:opacity-80 group-focus-visible:opacity-100">
          {enabled ? <Eye size={12} /> : <EyeOff size={12} />}
        </span>
      )}
    </>
  )

  const className = cn(
    'group relative flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left transition-colors',
    interactive && 'cursor-pointer hover:bg-sky-400/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-300/70',
    (!enabled || availability !== 'available') && 'opacity-40',
  )
  if (!interactive) return <div className={className}>{content}</div>
  return (
    <button
      type="button"
      className={className}
      title={`${enabled ? '隐藏' : '显示'}${item.label}`}
      aria-pressed={enabled}
      onClick={() => item.onToggle ? item.onToggle() : toggleLayer(item.visibilityKey!)}
    >
      {content}
    </button>
  )
}

function LayerSectionView({ section }: { section: SceneLayerSection }) {
  const [open, setOpen] = useState(section.defaultOpen)
  return (
    <section className="border-b border-sky-400/10 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-1 px-2.5 py-1.5 text-left text-[10px] tracking-[1px] text-sky-300/70 hover:text-sky-100"
        onClick={() => setOpen(value => !value)}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>{section.title}</span>
      </button>
      {open && <div className="px-0.5 pb-1">{section.items.map(item => <LayerRow key={item.id} item={item} />)}</div>}
    </section>
  )
}

/** 单列交互式图例：图形说明与显隐控制共享一行，避免固定开关列撑宽面板。 */
export default function SceneLayersPanel({ profile }: { profile: SceneLayerProfile }) {
  const [collapsed, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const impactReplay = useEventSimulationStore(state => state.activeEvent?.type === 'impact')
  const products = useSceneProductStore(state => state.products)
  const sections = useSceneLayerSections(profile)

  if (impactReplay && profile === 'event-detail' && !products.bPlane) return null
  if (collapsed) {
    return (
      <button
        type="button"
        title="展开场景图层"
        onClick={() => setCollapsed(false)}
        className="pointer-events-auto flex size-8 items-center justify-center rounded-sm border border-sky-300/55 bg-[rgba(8,20,42,0.86)] text-sky-100 shadow-[0_0_8px_rgba(125,211,252,0.25)] hover:border-sky-200"
      >
        <Layers3 size={15} />
      </button>
    )
  }

  const closeButton: ReactNode = (
    <button type="button" title="收起场景图层" className="mr-2 text-sky-300/65 hover:text-sky-100" onClick={() => setCollapsed(true)}>
      <X size={13} />
    </button>
  )
  return (
    <Panel title="场景图层" extra={closeButton} noPadding className="pointer-events-auto w-[208px] max-h-[calc(100vh-190px)]">
      <div className="min-h-0 overflow-y-auto hud-scroll py-1">
        {sections.map(section => <LayerSectionView key={`${profile}:${section.id}`} section={section} />)}
        <button
          type="button"
          className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-[10px] text-sky-300/65 hover:bg-sky-400/10 hover:text-sky-100"
          onClick={() => setSettingsOpen(value => !value)}
        >
          <SlidersHorizontal size={12} />
          <span>显示尺度设置</span>
          <span className="ml-auto">{settingsOpen ? '−' : '+'}</span>
        </button>
        {settingsOpen && <div className="border-t border-sky-400/10 pb-1"><SceneLayerSettings profile={profile} /></div>}
      </div>
    </Panel>
  )
}
