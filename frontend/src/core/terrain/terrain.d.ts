import type { Group, Material, PerspectiveCamera, Texture, WebGLRenderer } from 'three'
export interface TerrainStats { cached: number; visible: number; maxLevel: number; loading: number; failures: number }
export class GlobeTerrain {
  constructor(renderer: WebGLRenderer, createMaterial: (map: Texture) => Material)
  readonly group: Group
  readonly stats: TerrainStats
  setOpaque(opaque: boolean): void
  prefetch(points: { lon: number; lat: number; level?: number }[]): void
  setCrater(crater: { lon: number; lat: number; radius: number; depth: number } | null): void
  setCraterProgress(value: number): void
  height(lon: number, lat: number, minLevel?: number): { height: number; level: number } | null
  update(camera: PerspectiveCamera, now?: number): void
  reset(): void
  dispose(): void
}
