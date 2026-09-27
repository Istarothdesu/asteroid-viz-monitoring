import type { CSSProperties, ReactNode } from 'react';

/**
 * 七段数码管片段 (LCD 风): 渲染任意「数字 / 冒号 / 连字符 / 空格」字符串。
 *
 * - ghost: 底层叠一份「全 8」等长串 (未点亮的段隐约可见), 与点亮层同 .dseg7
 *   (同字号 / letter-spacing), 且数字→8 后每个字符占位不变, 故两层像素级对齐。
 * - blinkColon: 冒号每秒硬闪 (电子钟标志动效), 仅作用于点亮层; 拆分 ':' 后逐段包 span。
 * - size: 字号 px (内联覆盖 .dseg7 未定的 font-size, 便于各处按容器高度取值)。
 *
 * DSEG7 数字等宽、冒号与空格同宽, 连字符 / 空格为合法符号字形, 故日期与时刻皆可直排。
 */
export function SevenSeg({
  value,
  size,
  ghost = false,
  blinkColon = false,
  className = 'text-sky-200',
}: {
  value: string;
  size: number;
  ghost?: boolean;
  blinkColon?: boolean;
  className?: string;
}) {
  const style: CSSProperties = { fontSize: `${size}px` };
  /* 点亮层: 冒号闪烁时把 ':' 逐个包进 seg-colon-blink, 其余原样 */
  const lit: ReactNode = blinkColon
    ? value.split(':').map((seg, i) => (
        <span key={i}>
          {i > 0 && <span className="seg-colon-blink">:</span>}
          {seg}
        </span>
      ))
    : value;

  return (
    <span className="relative inline-block leading-none whitespace-nowrap">
      {ghost && (
        <span
          aria-hidden
          className="dseg7 block text-sky-300/[0.08] select-none"
          style={style}
        >
          {value.replace(/\d/g, '8')}
        </span>
      )}
      <span
        className={`dseg7 seg-glow block ${className} ${ghost ? 'absolute inset-0' : ''}`}
        style={style}
      >
        {lit}
      </span>
    </span>
  );
}
