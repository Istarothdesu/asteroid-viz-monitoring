import type * as THREE from 'three'

export interface OrbitalElements {
  a: number   // semi-major axis (AU)
  e: number   // eccentricity
  i: number   // inclination (deg)
  O: number   // longitude of ascending node Ω (deg)
  w: number   // argument of perihelion ω (deg)
  M0: number  // mean anomaly at J2000 epoch (deg)
}

export interface PlanetDef {
  a0: number; da: number
  e0: number; de: number
  i0: number; di: number
  L0: number; dL: number
  p0: number; dp: number
  O0: number; dO: number
  rKm: number
  color: number
  ring?: boolean
  name: string
  en: string
}

export interface BodyPosition {
  x: number
  y: number
  z: number
}

export type Vec3Out = THREE.Vector3 | { x: number; y: number; z: number }
