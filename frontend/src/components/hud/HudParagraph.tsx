import type { ReactNode } from 'react'

export default function HudParagraph({ children }: { children: ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-sky-100/75">{children}</p>
}
