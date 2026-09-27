import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * HUD 皮肤输入框: 深空底 + 天蓝细边 + 聚焦辉光, 与 .hud-panel 同语言。
 * 项目常驻深色, 故去掉 shadcn 默认的 dark: 前缀变体与圆角大间距,
 * 尺寸/字号对齐 HUD 信息面板的 12px 密度。
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-sm border border-sky-400/25 bg-[rgba(8,20,42,0.8)] px-2.5 py-1 text-[12px] text-sky-100",
        "transition-all outline-none",
        "placeholder:text-sky-500/60 selection:bg-sky-400/30",
        "hover:border-sky-400/45",
        "focus-visible:border-sky-300/70 focus-visible:shadow-[0_0_8px_rgba(125,211,252,0.3)]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-red-400/60 aria-invalid:shadow-[0_0_8px_rgba(248,113,113,0.35)]",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-[12px] file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input }
