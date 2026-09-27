import type { ImpactConfig, ImpactEvent, TrajectorySample } from './types'
export function createEvent(config: ImpactConfig, groundHeight: number): ImpactEvent
export function sampleEvent(event: ImpactEvent, time: number): TrajectorySample
export function phaseAt(event: ImpactEvent, time: number): string
export function playbackRate(event: ImpactEvent, time: number): number
