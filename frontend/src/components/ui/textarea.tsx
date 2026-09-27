import * as React from "react"

import { cn } from "@/lib/utils"

/** HUD 皮肤多行输入框 (与 input.tsx 同语言: 深空底 + 天蓝细边 + 聚焦辉光) */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 rounded-sm border border-sky-400/25 bg-[rgba(8,20,42,0.8)] px-2.5 py-1.5 text-[12px] text-sky-100",
        "transition-all outline-none field-sizing-content",
        "placeholder:text-sky-500/60 selection:bg-sky-400/30",
        "hover:border-sky-400/45",
        "focus-visible:border-sky-300/70 focus-visible:shadow-[0_0_8px_rgba(125,211,252,0.3)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-red-400/60 aria-invalid:shadow-[0_0_8px_rgba(248,113,113,0.35)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
