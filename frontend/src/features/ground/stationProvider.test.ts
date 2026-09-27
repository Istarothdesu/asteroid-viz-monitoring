import { afterEach, describe, expect, it } from 'vitest'
import {
  getGroundStationProvider,
  resetGroundStationProvider,
  setGroundStationProvider,
} from './stationProvider'

describe('地面站网数据端口', () => {
  afterEach(resetGroundStationProvider)

  it('允许外部站网适配器替换本地目录', () => {
    const stations = [{
      name: '测试站', country: '测试', lat: 1, lon: 2, type: '光学', desc: '测试数据',
    }]
    setGroundStationProvider({ id: 'external-test', getStations: () => stations })
    expect(getGroundStationProvider().id).toBe('external-test')
    expect(getGroundStationProvider().getStations()).toBe(stations)
  })
})
