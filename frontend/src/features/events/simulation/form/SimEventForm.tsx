import { useState } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import type { SimEventFormData } from '../types'
import BasicEventFields from './BasicEventFields'
import EncounterFields from './EncounterFields'
import OrbitFields from './OrbitFields'

interface SimEventFormProps {
  data: SimEventFormData
  onChange: (data: SimEventFormData) => void
  errors: Record<string, string>
}

export default function SimEventForm({ data, onChange, errors }: SimEventFormProps) {
  const [openSections, setOpenSections] = useState({
    basic: true,
    orbit: true,
    encounter: true,
  })

  const setField = (key: keyof SimEventFormData, value: unknown) => {
    onChange({ ...data, [key]: value })
  }
  const setOrbitElement = (key: keyof SimEventFormData['el'], value: number) => {
    onChange({ ...data, el: { ...data.el, [key]: value } })
  }
  const setSection = (key: keyof typeof openSections) => (open: boolean) => {
    setOpenSections((current) => ({ ...current, [key]: open }))
  }

  const sectionProps = { data, errors, setField }

  return (
    <div className="flex flex-col gap-2">
      <Collapsible open={openSections.basic} onOpenChange={setSection('basic')}>
        <CollapsibleTrigger title="基本信息" />
        <CollapsibleContent>
          <BasicEventFields {...sectionProps} />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible open={openSections.orbit} onOpenChange={setSection('orbit')}>
        <CollapsibleTrigger title="轨道信息" />
        <CollapsibleContent>
          <OrbitFields {...sectionProps} setOrbitElement={setOrbitElement} />
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={openSections.encounter}
        onOpenChange={setSection('encounter')}
      >
        <CollapsibleTrigger title={data.type === 'impact' ? '撞击信息' : '飞掠信息'} />
        <CollapsibleContent>
          <EncounterFields {...sectionProps} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
