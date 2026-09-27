"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-sm border border-sky-400/40 bg-[rgba(6,15,32,0.96)] px-2.5 py-1 text-[11px] tracking-wider text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.28)] backdrop-blur-sm has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {/* 箭头是 rotate-45 的菱形(svg 非等比拉伸, 故用盒模型 border 而非 stroke)。
            只描 right+bottom 两边: wrapper 按 side 旋转叠加 svg 自身 rotate-45 后,
            净旋转对 top/right/bottom/left 四个方向恰好都让这两条边构成朝外的尖角,
            朝内两边留 0 宽不描色, 避免压在内容上露出「内八字」。勿改回四边 border。
            -translate-y-1/2 让菱形对称骑在边框上 (尖端外伸约 7px, 两臂回接到框边);
            勿再叠加额外的 -2px, 否则菱形被推进框内、尖端显得偏内。 */}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 -translate-y-1/2 rotate-45 rounded-[2px] border-r border-b border-sky-400/40 bg-[rgba(6,15,32,0.96)] fill-[rgba(6,15,32,0.96)]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
