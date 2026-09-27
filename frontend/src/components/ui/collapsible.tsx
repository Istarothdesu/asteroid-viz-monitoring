import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/* HUD 皮肤折叠面板: 与 Panel / tooltip 同语言 (天蓝细边 + 深空底 + hover 辉光)。
   项目统一从 radix-ui 聚合包引入原语, 不用 @radix-ui/react-* 单包。
   Trigger 支持 title 文本标题 (左侧色条 + 右侧箭头随开合旋转), 也可用 children 自定义。 */

function Collapsible({
  className,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      className={cn(
        "rounded-sm border border-sky-400/15 bg-sky-400/[0.03] overflow-hidden",
        className,
      )}
      {...props}
    />
  )
}

function CollapsibleTrigger({
  className,
  title,
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Trigger> & {
  /** 文本标题 (缺省则渲染 children) */
  title?: string
}) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      className={cn(
        "group flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5",
        "text-[11px] font-bold tracking-wide text-sky-300/90 transition-colors",
        "hover:bg-sky-400/[0.08] hover:text-sky-100",
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="inline-block h-3 w-0.5 shrink-0 rounded-[1px] bg-gradient-to-b from-sky-300 to-sky-600 shadow-[0_0_5px_rgba(59,130,246,0.8)]" />
        <span className="truncate">{title ?? children}</span>
      </span>
      <ChevronDown
        size={14}
        className="shrink-0 text-sky-400/70 transition-transform duration-200 group-data-[state=open]:rotate-180"
      />
    </CollapsiblePrimitive.Trigger>
  )
}

function CollapsibleContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Content>) {
  return (
    <CollapsiblePrimitive.Content
      data-slot="collapsible-content"
      className={cn(
        "overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
        className,
      )}
      {...props}
    >
      <div className="space-y-2 border-t border-sky-400/10 px-2.5 py-2.5">
        {children}
      </div>
    </CollapsiblePrimitive.Content>
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
