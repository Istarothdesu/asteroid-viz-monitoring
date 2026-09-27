import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import SimEventField from './SimEventField'
import type { SimEventFormSectionProps } from './types'

export default function BasicEventFields({
  data,
  errors,
  setField,
}: SimEventFormSectionProps) {
  return (
    <>
      <SimEventField label="事件名称" required error={errors.name}>
        <Input
          value={data.name}
          onChange={(event) => setField('name', event.target.value)}
          placeholder="例: 2025 XX 近距离飞掠"
          aria-invalid={!!errors.name}
        />
      </SimEventField>

      <SimEventField label="事件描述">
        <Textarea
          value={data.desc}
          onChange={(event) => setField('desc', event.target.value)}
          placeholder="事件背景说明"
          className="h-14 resize-none"
        />
      </SimEventField>

      <div className="grid grid-cols-2 gap-2.5">
        <SimEventField label="事件类型" required>
          <Select value={data.type} onValueChange={(value) => setField('type', value)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="flyby">飞掠</SelectItem>
                <SelectItem value="impact">撞击</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SimEventField>

        <SimEventField label="目标类型">
          <Select
            value={data.targetType}
            onValueChange={(value) => setField('targetType', value)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="石质小行星">石质小行星</SelectItem>
                <SelectItem value="碳质小行星">碳质小行星</SelectItem>
                <SelectItem value="金属小行星">金属小行星</SelectItem>
                <SelectItem value="彗星">彗星</SelectItem>
                <SelectItem value="未知">未知</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SimEventField>
      </div>

      <SimEventField label="目标直径 (米)" required error={errors.diam}>
        <Input
          type="number"
          value={data.diam}
          onChange={(event) => setField('diam', +event.target.value)}
          min={0.1}
          step="any"
          aria-invalid={!!errors.diam}
        />
      </SimEventField>
    </>
  )
}
