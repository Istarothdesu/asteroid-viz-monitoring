import * as React from "react"
import { Slider as SliderPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * HUD 皮肤滑杆 (Radix Slider): 轨道为天蓝细槽 + 已选区间亮带,
 * 圆形拇指带辉光; 视觉语言与 Input/Select 一致。
 */
function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn("relative flex w-full touch-none items-center select-none", className)}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative h-1 w-full grow overflow-hidden rounded-full bg-sky-400/20"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-gradient-to-r from-sky-500/70 to-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.6)]"
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        data-slot="slider-thumb"
        className="block size-3 shrink-0 rounded-full border border-sky-100/80 bg-sky-300
          shadow-[0_0_8px_rgba(125,211,252,0.8)] cursor-pointer transition-shadow
          hover:shadow-[0_0_12px_rgba(125,211,252,1)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50
          disabled:pointer-events-none disabled:opacity-50"
      />
    </SliderPrimitive.Root>
  )
}

export { Slider }
