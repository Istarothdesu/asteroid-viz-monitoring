import { Input } from '@/components/ui/input'
import { estimateEnergyMt, shockAreaFromEnergy } from '@/utils/orbital/impact'
import SimEventField from './SimEventField'
import type { SimEventFormSectionProps } from './types'

export default function EncounterFields({
  data,
  errors,
  setField,
}: SimEventFormSectionProps) {
  if (data.type === 'flyby') {
    return (
      <SimEventField label="最近接近距离 (km)" required error={errors.missKm}>
        <Input
          type="number"
          value={data.missKm ?? 100000}
          onChange={(event) => setField('missKm', +event.target.value)}
          step="any"
          min={0}
          aria-invalid={!!errors.missKm}
        />
      </SimEventField>
    )
  }

  const estimatedEnergy = estimateEnergyMt(data.diam)
  const manualEnergy = data.energyMt != null
  const energy = manualEnergy ? data.energyMt! : estimatedEnergy
  const shockArea = data.shockAreaKm2 ?? shockAreaFromEnergy(energy)

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <SimEventField label="坠落纬度 (°)">
          <Input
            type="number"
            value={data.impactLat ?? 30}
            onChange={(event) => setField('impactLat', +event.target.value)}
            step="any"
            min={-90}
            max={90}
          />
        </SimEventField>
        <SimEventField label="坠落经度 (°)">
          <Input
            type="number"
            value={data.impactLon ?? 110}
            onChange={(event) => setField('impactLon', +event.target.value)}
            step="any"
            min={-180}
            max={180}
          />
        </SimEventField>
        <SimEventField label="爆炸高度 (km)">
          <Input
            type="number"
            value={data.burstAltKm ?? 0}
            onChange={(event) => setField('burstAltKm', Math.max(0, +event.target.value))}
            step="any"
            min={0}
          />
        </SimEventField>
        <SimEventField label="冲击波范围 (km²)">
          <Input
            type="number"
            value={Math.round(shockArea)}
            onChange={(event) => setField('shockAreaKm2', Math.max(1, +event.target.value))}
            step="any"
            min={1}
          />
        </SimEventField>
      </div>

      <SimEventField label="爆炸能量 (Mt TNT 当量)" as="div">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={+energy.toFixed(3)}
            disabled={!manualEnergy}
            onChange={(event) => setField('energyMt', Math.max(0, +event.target.value))}
            step="any"
            min={0}
            className="flex-1"
          />
          <label className="flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap text-[10px] text-sky-400/90">
            <input
              type="checkbox"
              className="accent-sky-400"
              checked={manualEnergy}
              onChange={(event) => {
                setField('energyMt', event.target.checked ? estimatedEnergy : undefined)
              }}
            />
            手动
          </label>
        </div>
      </SimEventField>
    </>
  )
}
