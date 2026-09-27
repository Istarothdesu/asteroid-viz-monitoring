import { Vector3, Matrix4 } from 'three'
export const A: number
export const B: number
export function toECEF(lon: number, lat: number, height?: number, out?: Vector3): Vector3
export function fromECEF(point: Vector3): { lon: number; lat: number; height: number }
export function upAt(lon: number, lat: number, out?: Vector3): Vector3
export function tileGeo(x: number, y: number, z: number, u?: number, v?: number): { lon: number; lat: number }
export function geoTile(lon: number, lat: number, z: number): { x: number; y: number }
export function frameAt(lon: number, lat: number, height?: number): { origin: Vector3; east: Vector3; up: Vector3; south: Vector3; basis: Matrix4 }
export function clamp(value: number, min: number, max: number): number
export function smooth(value: number): number

export function surfaceDistance(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number
