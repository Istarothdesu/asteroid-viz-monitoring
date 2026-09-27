import { Vector3 } from 'three';
import { fromECEF, frameAt, clamp } from '../terrain/geo.js';
const ENTRY_HEIGHT = 120000, START_HEIGHT = 1800000;

// 演示轨迹供应器：沿给定入射方向生成 ECEF 采样，低层大气示意减速。
// 不是轨道积分 / 烧蚀求解器。专业分系统可用同一采样结构替换这里。
export function createEvent(config, groundHeight) {
  const frame = frameAt(config.lon, config.lat, groundHeight);
  const angle = config.angle * Math.PI / 180, azimuth = config.bearing * Math.PI / 180;
  const horizontal = frame.east.clone().multiplyScalar(Math.sin(azimuth)).addScaledVector(frame.south, -Math.cos(azimuth));
  const incoming = horizontal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(frame.up, -Math.sin(angle)).normalize();
  const backward = incoming.clone().negate();
  let lo = 0, hi = START_HEIGHT * 8;
  for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (fromECEF(frame.origin.clone().addScaledVector(backward, mid)).height < START_HEIGHT) lo = mid; else hi = mid; }
  const distance = (lo + hi) / 2, samples = [], count = 1200;
  let time = 0, previousSpeed = config.speed * 1000, entryTime = 0;
  for (let i = 0; i <= count; i++) {
    const remaining = distance * (1 - i / count), ecef = frame.origin.clone().addScaledVector(backward, remaining);
    const geo = fromECEF(ecef), above = Math.max(0, geo.height - groundHeight);
    const speed = config.speed * 1000 * (1 - .28 * Math.exp(-above / 22000));
    if (i) time += (distance / count) / ((speed + previousSpeed) / 2);
    const sample = { t: time, ecef, speed, height: geo.height, lon: geo.lon, lat: geo.lat };
    if (i && !entryTime && geo.height <= ENTRY_HEIGHT) {
      const prev = samples[i - 1], k = (prev.height - ENTRY_HEIGHT) / (prev.height - geo.height);
      entryTime = prev.t + (time - prev.t) * k;
    }
    samples.push(sample); previousSpeed = speed;
  }
  const impactTime = time, duration = time + 35;
  const observerECEF = frame.origin.clone().addScaledVector(horizontal, -config.observerDistance * .25)
    .addScaledVector(new Vector3().crossVectors(horizontal, frame.up), config.observerDistance);
  const observer = fromECEF(observerECEF);
  return { config, frame, incoming, horizontal, samples, groundHeight, entryTime, impactTime, duration,
    observer: { lon: observer.lon, lat: observer.lat },
    crater: { lon: config.lon, lat: config.lat, radius: config.craterRadius, depth: config.craterDepth } };
}

export function sampleEvent(event, time) {
  const samples = event.samples, t = clamp(time, 0, event.impactTime);
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].t <= t) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[hi], k = (t - a.t) / (b.t - a.t);
  const ecef = a.ecef.clone().lerp(b.ecef, k), geo = fromECEF(ecef);
  return { t, ecef, ...geo, speed: a.speed + (b.speed - a.speed) * k };
}

export function phaseAt(event, t) {
  return t < event.entryTime ? '太空接近' : t < event.impactTime ? '大气进入' : t < event.impactTime + 5 ? '地表撞击' : '抛射与烟尘';
}

// 事件时间与播放时间分开；大气段慢放，避免数秒内跳过整个地面观察过程。
export function playbackRate(event, time) {
  return time < event.entryTime - 12 ? 8 : time < event.entryTime ? 2 : time < event.impactTime ? .45 : 1;
}
