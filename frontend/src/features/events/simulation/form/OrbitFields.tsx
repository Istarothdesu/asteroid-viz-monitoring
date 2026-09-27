import { Input } from '@/components/ui/input'
import SimEventField from './SimEventField'
import type { OrbitFieldsProps } from './types'

export default function OrbitFields({
  data,
  errors,
  setField,
  setOrbitElement,
}: OrbitFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <SimEventField label="半长轴 a (AU)" required error={errors.a}>
          <Input
            type="number"
            value={data.el.a}
            onChange={(event) => setOrbitElement('a', +event.target.value)}
            step="any"
            aria-invalid={!!errors.a}
          />
        </SimEventField>
        <SimEventField label="偏心率 e" required error={errors.e}>
          <Input
            type="number"
            value={data.el.e}
            onChange={(event) => setOrbitElement('e', +event.target.value)}
            step="any"
            min={0}
            max={0.999}
            aria-invalid={!!errors.e}
          />
        </SimEventField>
        <SimEventField label="倾角 i (°)">
          <Input
            type="number"
            value={data.el.i}
            onChange={(event) => setOrbitElement('i', +event.target.value)}
            step="any"
          />
        </SimEventField>
        <SimEventField label="升交点经度 Ω (°)">
          <Input
            type="number"
            value={data.el.O}
            onChange={(event) => setOrbitElement('O', +event.target.value)}
            step="any"
          />
        </SimEventField>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <SimEventField label="近日点幅角 ω (°)">
          <Input
            type="number"
            value={data.el.w}
            onChange={(event) => setOrbitElement('w', +event.target.value)}
            step="any"
          />
        </SimEventField>
        <SimEventField label="提前显示 (小时)" required error={errors.leadH}>
          <Input
            type="number"
            value={data.leadH}
            onChange={(event) => setField('leadH', +event.target.value)}
            step="any"
            min={1}
            aria-invalid={!!errors.leadH}
          />
        </SimEventField>
      </div>

      <SimEventField label="遭遇时间 (UTC)" required error={errors.dateUTC}>
        <Input
          type="datetime-local"
          value={data.dateUTC}
          onChange={(event) => setField('dateUTC', event.target.value)}
          aria-invalid={!!errors.dateUTC}
        />
      </SimEventField>
    </>
  )
}
