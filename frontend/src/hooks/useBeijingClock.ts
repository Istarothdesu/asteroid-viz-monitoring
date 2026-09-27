import { useState, useEffect } from 'react';

/**
 * 北京时间 = UTC+8 (中国无夏令时)。用「UTC 瞬时 +8h 后读 UTC 分量」计算,
 * 不依赖运行环境的时区数据库, 保证任何机器 (含非东八区) 都显示北京时间。
 */
function fmtBeijing(d: Date): string {
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ` +
    `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}`
  );
}

/**
 * 顶栏真实时钟: 当前北京时间, 每秒跳动 (yyyy-MM-dd HH:mm:ss)。
 * 直接以格式化字符串入 state, 避免无关渲染重复格式化。
 * (仿真时间已由场景电子钟 SimDigitalClock 走 useLiveJd 承担)
 */
export function useBeijingClock(): string {
  const [str, setStr] = useState(() => fmtBeijing(new Date()));

  useEffect(() => {
    const id = setInterval(() => setStr(fmtBeijing(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return str;
}
