import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export default function SimEventField({
  label,
  required,
  error,
  as = 'label',
  className,
  children,
}: {
  label: ReactNode
  required?: boolean
  error?: string
  as?: 'label' | 'div'
  className?: string
  children: ReactNode
}) {
  const Tag = as
  return (
    <Tag
      className={cn('flex flex-col gap-1.5 text-[11px] text-sky-400/90', className)}
      data-invalid={!!error || undefined}
    >
      <span className="flex items-center gap-0.5 tracking-wide text-sky-300/90">
        {label}
        {required && <span className="text-red-400/85">*</span>}
      </span>
      {children}
      {error && <div className="text-[10px] text-red-400/85">{error}</div>}
    </Tag>
  )
}
