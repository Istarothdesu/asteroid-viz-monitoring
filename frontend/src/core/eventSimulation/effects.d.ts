import type { Group, PointLight } from 'three'
import type { ImpactEvent } from './types'
import type { SimulationWorld } from './world'
export class EventEffects {
  constructor(world: SimulationWorld, event: ImpactEvent)
  group: Group
  fireLight: PointLight
  update(time: number): void
  dispose(): void
}
