import type { BufferGeometry, Vector3 } from 'three'
export interface Crater { lon?: number; lat?: number; radius: number; depth: number }
export function heightGrid(source: BufferGeometry, segments: number): Float32Array
export function sampleGrid(grid: Float32Array, segments: number, u: number, v: number): number
export function craterDelta(distance: number, crater: Crater | null): number
export function buildCurvedTile(coord: { x: number; y: number; z: number }, grid: Float32Array, segments: number, crater?: Crater | null): {
  geometry: BufferGeometry; anchor: Vector3; base: Float32Array; deformation: Float32Array | null; stain: number[]
}
