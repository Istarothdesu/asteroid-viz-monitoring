export interface SimEventFormData {
  name: string
  desc: string
  type: 'flyby' | 'impact'
  targetType: string
  diam: number
  dateUTC: string
  el: {
    a: number
    e: number
    i: number
    O: number
    w: number
  }
  missKm?: number
  leadH: number
  impactLat?: number
  impactLon?: number
  burstAltKm?: number
  energyMt?: number
  shockAreaKm2?: number
}

export interface ImpactPhysics {
  burstAltKm?: number
  energyMt?: number
  shockAreaKm2?: number
}
