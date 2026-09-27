export function formatDiameter(km: number): string {
  return km >= 1 ? `${km.toFixed(2)} km` : `${(km * 1000).toFixed(0)} m`
}

export function formatEnergy(mt: number): string {
  return mt >= 1
    ? `${mt >= 10 ? mt.toFixed(0) : mt.toFixed(2)} Mt`
    : `${(mt * 1000).toFixed(1)} kt`
}
