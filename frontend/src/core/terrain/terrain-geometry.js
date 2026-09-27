import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import { toECEF, tileGeo, upAt, surfaceDistance } from "./geo.js";

// 将 three-tile 已解码的平面三角网采样为规则高程网格。
// 平坦区域的 Martini 网格也需加密，否则弯到地球上后只有两片巨大的三角形。
export function heightGrid(source, segments) {
  const count = segments + 1, grid = new Float32Array(count * count);
  const uv = source.attributes.uv, positions = source.attributes.position, indices = source.index;
  if (!uv || !indices) return grid;
  // LERC 的 NoData 是约 -3.4e38，必须在插值前置零；正常海底负高程仍保留。
  const elevation = (index) => {
    const height = positions.getZ(index);
    return Number.isFinite(height) && Math.abs(height) < 1e20 ? height : 0;
  };
  for (let k = 0; k < indices.count; k += 3) {
    const a = indices.getX(k), b = indices.getX(k + 1), c = indices.getX(k + 2);
    const ha = elevation(a), hb = elevation(b), hc = elevation(c);
    const ax = uv.getX(a), ay = 1 - uv.getY(a), bx = uv.getX(b), by = 1 - uv.getY(b), cx = uv.getX(c), cy = 1 - uv.getY(c);
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue; // 裙边在 UV 中退化，不参与地表采样。
    const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx) * segments - 1e-5));
    const x1 = Math.min(segments, Math.floor(Math.max(ax, bx, cx) * segments + 1e-5));
    const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy) * segments - 1e-5));
    const y1 = Math.min(segments, Math.floor(Math.max(ay, by, cy) * segments + 1e-5));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x / segments, py = y / segments;
      const wa = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
      const wb = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
      if (wa < -1e-5 || wb < -1e-5 || wa + wb > 1.00001) continue;
      grid[y * count + x] = wa * ha + wb * hb + (1 - wa - wb) * hc;
    }
  }
  return grid;
}

export function sampleGrid(grid, segments, u, v) {
  const px = Math.max(0, Math.min(segments, u * segments)), py = Math.max(0, Math.min(segments, v * segments));
  const x = Math.min(segments - 1, Math.floor(px)), y = Math.min(segments - 1, Math.floor(py));
  const a = px - x, b = py - y, n = segments + 1;
  // 与地形三角形使用同一条对角线，避免双线性采样把观察相机放进坡面。
  const h00 = grid[y * n + x], h10 = grid[y * n + x + 1];
  const h01 = grid[(y + 1) * n + x], h11 = grid[(y + 1) * n + x + 1];
  return a + b <= 1 ? h00 + a * (h10 - h00) + b * (h01 - h00)
    : h11 + (1 - a) * (h01 - h11) + (1 - b) * (h10 - h11);
}

export function craterDelta(distance, crater) {
  if (!crater) return 0;
  const r = distance / crater.radius;
  if (r < 1) return -crater.depth * (1 - r * r) ** 2;
  if (r < 1.7) return crater.depth * 0.18 * Math.sin(Math.PI * (r - 1) / 0.7) ** 2;
  return 0;
}

export function buildCurvedTile(coord, grid, segments, crater = null) {
  const { x, y, z } = coord, center = tileGeo(x, y, z), anchor = toECEF(center.lon, center.lat);
  const positions = [], uv = [], indices = [], offsets = [], colors = [], stain = [], n = segments + 1;
  const point = new Vector3(), normal = new Vector3();
  const skirtDepth = Math.max(25, Math.min(2500, 300000 / 2 ** z));
  function vertex(u, v, height) {
    const geo = tileGeo(x, y, z, u, v);
    toECEF(geo.lon, geo.lat, height, point).sub(anchor);
    positions.push(point.x, point.y, point.z); uv.push(u, 1 - v);
    const delta = crater ? craterDelta(surfaceDistance(geo, crater), crater) : 0;
    upAt(geo.lon, geo.lat, normal).multiplyScalar(delta);
    offsets.push(normal.x, normal.y, normal.z);
    colors.push(1, 1, 1);
    stain.push(crater ? Math.max(0, 1 - surfaceDistance(geo, crater) / (crater.radius * 1.8)) * .72 : 0);
    return positions.length / 3 - 1;
  }
  for (let j = 0; j <= segments; j++) for (let i = 0; i <= segments; i++) vertex(i / segments, j / segments, grid[j * n + i]);
  for (let j = 0; j < segments; j++) for (let i = 0; i < segments; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const edge = [];
  for (let i = 0; i <= segments; i++) edge.push(i);
  for (let j = 1; j <= segments; j++) edge.push(j * n + segments);
  for (let i = segments - 1; i >= 0; i--) edge.push(segments * n + i);
  for (let j = segments - 1; j > 0; j--) edge.push(j * n);
  // 裙边使用独立顶点，避免垂直侧壁法线把瓦片边缘染成黑线。
  const rim = edge.map((a) => vertex((a % n) / segments, Math.floor(a / n) / segments, grid[a]));
  const skirt = edge.map((a) => vertex((a % n) / segments, Math.floor(a / n) / segments, grid[a] - skirtDepth));
  for (let i = 0; i < edge.length; i++) {
    const k = (i + 1) % edge.length;
    indices.push(rim[i], skirt[i], rim[k], rim[k], skirt[i], skirt[k]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometry.computeBoundingBox();
  const deformation = offsets.some((x) => Math.abs(x) > 0.001) ? new Float32Array(offsets) : null;
  return { geometry, anchor, base: new Float32Array(positions), deformation, stain };
}
