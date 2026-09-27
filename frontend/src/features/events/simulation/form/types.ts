import type { SimEventFormData } from '../types'

export interface SimEventFormSectionProps {
  data: SimEventFormData
  errors: Record<string, string>
  setField: (key: keyof SimEventFormData, value: unknown) => void
}

export interface OrbitFieldsProps extends SimEventFormSectionProps {
  setOrbitElement: (key: keyof SimEventFormData['el'], value: number) => void
}
