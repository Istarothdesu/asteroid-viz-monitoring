import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface HudTableProps {
  headers: string[]
  rows: ReactNode[][]
  className?: string
}

/** HUD 风格只读表格，用于结构化说明与指标展示。 */
export default function HudTable({ headers, rows, className }: HudTableProps) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-sky-400/20 text-sky-300/80">
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap py-1 pr-2 text-left font-normal">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-sky-400/10 last:border-0">
              {row.map((cell, columnIndex) => (
                <td key={`${rowIndex}:${columnIndex}`} className="py-1 pr-2 align-top text-sky-100/75">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
