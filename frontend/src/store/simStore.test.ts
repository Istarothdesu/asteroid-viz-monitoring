import { beforeEach, describe, expect, it } from 'vitest'
import { useSimStore } from './simStore'

describe('simStore 播放边界', () => {
  beforeEach(() => {
    useSimStore.setState({
      jd: 5,
      jdMin: 0,
      jdMax: 10,
      timelineScaleDays: 30,
      timelineCenterJd: 5,
      playRate: 60,
      playing: false,
    })
  })

  it('正向到达终点后再次播放会回到起点', () => {
    useSimStore.setState({ jd: 10 })
    useSimStore.getState().setPlaying(true)
    expect(useSimStore.getState()).toMatchObject({ playing: true, jd: 0, playRate: 60 })
  })

  it('反向到达起点后再次播放会回到终点', () => {
    useSimStore.setState({ jd: 0, playRate: -60 })
    useSimStore.getState().setPlaying(true)
    expect(useSimStore.getState()).toMatchObject({ playing: true, jd: 10, playRate: -60 })
  })

  it('暂停中点恢复播放时使用默认 60倍速率', () => {
    useSimStore.setState({ playRate: 0 })
    useSimStore.getState().setPlaying(true)
    expect(useSimStore.getState()).toMatchObject({ playing: true, jd: 5, playRate: 60 })
  })

  it('时间尺度独立于仿真数据范围', () => {
    useSimStore.getState().setTimelineScaleDays(1 / 24)
    expect(useSimStore.getState()).toMatchObject({
      jdMin: 0,
      jdMax: 10,
      timelineScaleDays: 1 / 24,
    })
  })

  it('移动时间轴游标不会改变时间轴中心', () => {
    useSimStore.getState().setJD(8)
    expect(useSimStore.getState()).toMatchObject({
      jd: 8,
      timelineCenterJd: 5,
    })
  })
})
