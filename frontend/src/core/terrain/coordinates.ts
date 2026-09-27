import { SphereGeometry, Vector3 } from 'three'
import { AU_KM } from '@/utils/orbital/constants'
import { A, B, toECEF } from './geo.js'

export const METERS_PER_AU = AU_KM * 1000
export const EARTH_REFERENCE_RADIUS = 6371000

/** 与现有地球贴图保持相同 UV；地理纬度对应 WGS84 椭球，局部 +Y 为北极。 */
export function createEarthEllipsoid(): SphereGeometry {
  const geometry = new SphereGeometry(1, 256, 128)
  const position = geometry.attributes.position, uv = geometry.attributes.uv
  const p = new Vector3()
  for (let i = 0; i < position.count; i++) {
    // 低精度底球稍内缩，给曲面瓦片及其三角形弦高留出空间，避免交叉闪烁。
    toECEF(uv.getX(i) * 360 - 180, uv.getY(i) * 180 - 90, -1500, p)
    position.setXYZ(i, p.x / EARTH_REFERENCE_RADIUS, p.z / EARTH_REFERENCE_RADIUS, -p.y / EARTH_REFERENCE_RADIUS)
  }
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/** ECEF 米制射线与参考椭球求交；用于把远景旋转中心连续移到眼前地表。 */
export function intersectEarth(origin: Vector3, direction: Vector3): Vector3 | null {
  const ox = origin.x / A, oy = origin.y / A, oz = origin.z / B
  const dx = direction.x / A, dy = direction.y / A, dz = direction.z / B
  const a = dx * dx + dy * dy + dz * dz
  const b = ox * dx + oy * dy + oz * dz
  const c = ox * ox + oy * oy + oz * oz - 1
  const discriminant = b * b - a * c
  if (discriminant < 0) return null
  const t = (-b - Math.sqrt(discriminant)) / a
  return t >= 0 ? origin.clone().addScaledVector(direction, t) : null
}
