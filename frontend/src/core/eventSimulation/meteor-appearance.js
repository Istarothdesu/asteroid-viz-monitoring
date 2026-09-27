import { clamp, smooth } from '../terrain/geo.js';
const ENTRY_HEIGHT = 120000;

// 只补偿显示尺寸，事件的直径、轨迹和撞击计算始终使用原始参数。
export function meteorAppearance(diameter, height, distance, fov, viewportHeight) {
  const metresPerPixel = 2 * distance * Math.tan(fov * Math.PI / 360) / Math.max(1, viewportHeight);
  const bodyPixels = diameter / Math.max(.001, metresPerPixel);
  const heat = smooth((ENTRY_HEIGHT - height) / 65000);
  const close = smooth((400000 - distance) / 250000);
  const rockScale = Math.max(1, 7 * close / Math.max(.001, bodyPixels));
  const boost = 1 + heat * (clamp(distance / 25000, 1, 7) - 1);
  const glowDiameter = Math.max(diameter * (3 + heat * 15) * boost, metresPerPixel * (12 + 34 * heat));
  const ignition = smooth((ENTRY_HEIGHT - height) / 6000);
  const visiblePixels = Math.max(bodyPixels * rockScale, glowDiameter / Math.max(.001, metresPerPixel) * .38 * ignition);
  // 按实际屏幕尺寸交接，不在某个距离突然关掉标记。
  const markerOpacity = 1 - smooth((visiblePixels - 5) / 8);
  return { metresPerPixel, heat, ignition, boost, rockScale, glowDiameter, markerOpacity, visiblePixels };
}

export function emissionTime(event, time, index, interval) {
  const last = Math.floor((Math.min(time, event.impactTime - 1e-5) - event.entryTime) / interval);
  return event.entryTime + (last - index) * interval;
}

export function particleRandom(index, salt) {
  const n = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
