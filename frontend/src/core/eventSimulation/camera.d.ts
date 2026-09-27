import type { ImpactEvent, SimulationView } from './types'
import type { SimulationWorld } from './world'
export class EventCamera {
  constructor(world: SimulationWorld, event: ImpactEvent)
  mode: SimulationView
  setMode(mode: SimulationView): void
  update(time: number, now: number): void
}
