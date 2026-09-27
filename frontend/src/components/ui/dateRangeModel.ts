/** Date → UTC 日期串 (yyyy-MM-dd)，与后端查询参数同形。 */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export interface DateRangePreset {
  key: string
  label: string
  title?: string
}

export type DateRangeValue =
  | { kind: 'preset'; key: string }
  | { kind: 'custom'; from: string; to: string }
