import { Matrix4, Vector3 } from "three";

export const A = 6378137;
export const B = 6356752.314245;
const E2 = 1 - (B * B) / (A * A);
const DEG = Math.PI / 180;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const smooth = (x) => (x = clamp(x, 0, 1), x * x * (3 - 2 * x));

// 所有地理位置以 WGS84 / 米保存；提交 GPU 前减去区域原点。
export function toECEF(lon, lat, height = 0, out = new Vector3()) {
  const p = lat * DEG, l = lon * DEG, s = Math.sin(p), c = Math.cos(p);
  const n = A / Math.sqrt(1 - E2 * s * s);
  return out.set((n + height) * c * Math.cos(l), (n + height) * c * Math.sin(l), (n * (1 - E2) + height) * s);
}

export function fromECEF(point) {
  const r = Math.hypot(point.x, point.y);
  if (r < 1e-7) return { lon: 0, lat: Math.sign(point.z) * 90, height: Math.abs(point.z) - B };
  let p = Math.atan2(point.z, r * (1 - E2));
  for (let i = 0; i < 8; i++) {
    const n = A / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
    p = Math.atan2(point.z + E2 * n * Math.sin(p), r);
  }
  const n = A / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
  const height = r * Math.cos(p) + point.z * Math.sin(p) - n * (1 - E2 * Math.sin(p) ** 2);
  return { lon: Math.atan2(point.y, point.x) / DEG, lat: p / DEG, height };
}

export function upAt(lon, lat, out = new Vector3()) {
  const p = lat * DEG, l = lon * DEG;
  return out.set(Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p));
}

// 局部坐标：X 东、Y 上、Z 南，与 Three.js 的 Y-up 控制器一致。
export function frameAt(lon, lat, height = 0) {
  const l = lon * DEG;
  const up = upAt(lon, lat), east = new Vector3(-Math.sin(l), Math.cos(l), 0);
  const south = new Vector3().crossVectors(east, up).normalize();
  const basis = new Matrix4().makeBasis(east, up, south);
  return { origin: toECEF(lon, lat, height), east, up, south, basis };
}

export function tileGeo(x, y, z, u = 0.5, v = 0.5) {
  const n = 2 ** z;
  return { lon: ((x + u) / n) * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + v) / n))) / DEG };
}

export function geoTile(lon, lat, z) {
  const n = 2 ** z, p = clamp(lat, -85.05112877, 85.05112877) * DEG;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.asinh(Math.tan(p)) / Math.PI) / 2) * n };
}

export function surfaceDistance(a, b) {
  const p = a.lat * DEG, q = b.lat * DEG, d = (b.lon - a.lon) * DEG;
  const h = Math.sin((q - p) / 2) ** 2 + Math.cos(p) * Math.cos(q) * Math.sin(d / 2) ** 2;
  return 2 * A * Math.asin(Math.sqrt(clamp(h, 0, 1)));
}
