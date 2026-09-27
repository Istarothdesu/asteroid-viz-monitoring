import { GROUND_STATIONS } from '@/data/groundStations'
import type { GroundStation } from '@/types/asteroid'

/** 地面站网数据端口；站点下标是当前选中、检索和三维对象共享的稳定标识。 */
export interface GroundStationProvider {
  readonly id: string
  getStations(): readonly GroundStation[]
}

const localCatalogProvider: GroundStationProvider = {
  id: 'local-ground-station-catalog',
  getStations: () => GROUND_STATIONS,
}

let activeProvider = localCatalogProvider

export function getGroundStationProvider(): GroundStationProvider {
  return activeProvider
}

export function setGroundStationProvider(provider: GroundStationProvider): void {
  activeProvider = provider
}

export function resetGroundStationProvider(): void {
  activeProvider = localCatalogProvider
}
