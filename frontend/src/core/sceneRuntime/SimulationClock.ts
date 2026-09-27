export interface SimulationClockInput {
  jd: number
  seekRevision?: number
  jdMin: number
  jdMax: number
  playing: boolean
  playRate: number
}

/**
 * 三维场景专用的无 React 仿真时钟。
 * 播放期间只更新内存值，暂停瞬间再由 SceneManager 同步到 Zustand。
 */
export class SimulationClock {
  readonly liveJd = { value: 0 }
  justPaused = false
  reachedBoundary = false

  private jd = 0
  private wasPlaying = false
  private lastStoreJd = 0
  private lastSeekRevision = 0
  private smoothDt = 1 / 60

  tick(input: SimulationClockInput, frameDtSeconds: number): number {
    const sought = (input.seekRevision ?? 0) !== this.lastSeekRevision
    this.lastSeekRevision = input.seekRevision ?? 0
    this.smoothDt = this.smoothDt * 0.9 + frameDtSeconds * 0.1
    this.justPaused = this.wasPlaying && !input.playing
    this.reachedBoundary = false
    this.wasPlaying = input.playing

    if (!input.playing) {
      this.smoothDt = 1 / 60
      if (sought || !this.justPaused || input.jd !== this.lastStoreJd || this.jd === 0) {
        this.jd = input.jd
        this.lastStoreJd = input.jd
      }
    } else {
      if (this.jd === 0) {
        this.jd = input.jd
        this.lastStoreJd = input.jd
      } else if (sought || input.jd !== this.lastStoreJd) {
        this.jd = input.jd
      }
      this.lastStoreJd = input.jd

      const playRate = Number.isFinite(input.playRate) ? input.playRate : 60
      const nextJd = this.jd + playRate * this.smoothDt / 86400
      this.jd = Math.max(input.jdMin, Math.min(input.jdMax, nextJd))
      this.reachedBoundary = nextJd < input.jdMin || nextJd > input.jdMax
    }

    this.liveJd.value = this.jd
    return this.jd
  }
}
