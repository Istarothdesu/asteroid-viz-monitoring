import { useState, type ReactNode } from 'react'
import { Slider } from '@/components/ui/slider'
import type { SceneLayerProfile } from '@/core/sceneLayers'
import { useLayerStore } from '@/store/layerStore'

function SettingSlider({
  label,
  value,
  min,
  max,
  step,
  suffix = ' AU',
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="py-1.5 text-[11px]">
      <div className="mb-0.5 flex justify-between text-sky-400/70">
        <span>{label}</span>
        <span className="text-sky-200">{value.toFixed(2)}{suffix}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => onChange(next[0])}
        className="w-full"
      />
    </div>
  )
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full cursor-pointer select-none items-center gap-1 px-2.5 py-1.5 text-left text-[11px] text-sky-400 hover:text-sky-200"
      >
        <span className="w-2 text-[9px]">{open ? '▼' : '▶'}</span>
        {title}
      </button>
      {open && <div className="pl-1">{children}</div>}
    </div>
  )
}

function DisplaySettings() {
  const sizeScale = useLayerStore(state => state.sizeScale)
  const setSizeScale = useLayerStore(state => state.setSizeScale)
  return (
    <SettingsGroup title="天体显示">
      <div className="px-2">
        <SettingSlider
          label="天体尺寸倍数"
          value={sizeScale}
          min={0.2}
          max={5}
          step={0.1}
          suffix="×"
          onChange={setSizeScale}
        />
        <div className="px-0.5 pb-1.5 text-[10px] leading-relaxed text-sky-400/60">
          几何层按真实比例渲染；倍数等比放大所有天体，仅用于显示。
        </div>
      </div>
    </SettingsGroup>
  )
}

function L1MissionSettings() {
  const sphereR = useLayerStore(state => state.sphereR)
  const setSphereR = useLayerStore(state => state.setSphereR)
  return (
    <SettingsGroup title="L1 天球尺度">
      <div className="px-2">
        <SettingSlider
          label="天球显示尺度"
          value={sphereR}
          min={0.05}
          max={0.5}
          step={0.01}
          onChange={setSphereR}
        />
      </div>
    </SettingsGroup>
  )
}

function GroundMissionSettings() {
  const sphereR = useLayerStore(state => state.gSphereR)
  const setSphereR = useLayerStore(state => state.setGSphereR)
  return (
    <SettingsGroup title="地面天球尺度">
      <div className="px-2">
        <SettingSlider
          label="天球显示尺度"
          value={sphereR}
          min={0.05}
          max={0.5}
          step={0.01}
          onChange={setSphereR}
        />
      </div>
    </SettingsGroup>
  )
}

/** 图层开关已收敛到交互式图例；这里仅保留不适合占用图例行的连续参数。 */
export default function SceneLayerSettings({ profile }: { profile: SceneLayerProfile }) {
  return (
    <>
      <DisplaySettings />
      {profile === 'l1-survey' && <L1MissionSettings />}
      {profile === 'ground-survey' && <GroundMissionSettings />}
    </>
  )
}
