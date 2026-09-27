import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { toECEF, fromECEF } from './geo.js'
import { createEarthEllipsoid, EARTH_REFERENCE_RADIUS, intersectEarth } from './coordinates'

describe('地球曲面坐标', () => {
  it.each([[-111.06, 35.07], [116.4, 39.9], [179.99, -42], [0, 89.9]])(
    '经纬度 %s, %s 与米制高程往返一致', (lon, lat) => {
      const result = fromECEF(toECEF(lon, lat, 1850))
      expect(result.lon).toBeCloseTo(lon, 8)
      expect(result.lat).toBeCloseTo(lat, 8)
      expect(result.height).toBeCloseTo(1850, 5)
    },
  )
  it('底图 UV 与曲面瓦片使用同一经纬度，不复制贴图朝向修正到地形', () => {
    const geometry = createEarthEllipsoid()
    const pos = geometry.attributes.position, uv = geometry.attributes.uv
    for (const i of [1250, 5000, 12000, 28000]) {
      const local = new Vector3().fromBufferAttribute(pos, i).multiplyScalar(EARTH_REFERENCE_RADIUS)
      const geo = fromECEF(new Vector3(local.x, -local.z, local.y))
      expect(geo.lon).toBeCloseTo(uv.getX(i) * 360 - 180, 4)
      expect(geo.lat).toBeCloseTo(uv.getY(i) * 180 - 90, 4)
      expect(geo.height).toBeCloseTo(-1500, 0)
    }
    geometry.dispose()
  })
  it('视线对准地球时求得同一落点，背向地球时不接管相机', () => {
    const camera = toECEF(116.4, 39.9, 100000)
    const surface = toECEF(116.4, 39.9)
    const direction = surface.clone().sub(camera).normalize()
    expect(intersectEarth(camera, direction)!.distanceTo(surface)).toBeLessThan(0.001)
    expect(intersectEarth(camera, direction.negate())).toBeNull()
  })
})
