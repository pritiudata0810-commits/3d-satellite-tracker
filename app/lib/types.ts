export type TleRecord = {
  OBJECT_NAME: string
  TLE_LINE1: string
  TLE_LINE2: string
}

export type SatellitePoint = {
  norad: number
  name: string
  lat: number
  lng: number
  alt: number
  altKm: number
  inclination: number
  baseColor: number   // hex int e.g. 0xff8c00
  color?: number      // overridden per-frame (selection highlight etc.)
  _selected?: boolean
}

export type TelemetryPayload = {
  total: number
  inclination: {
    equatorial: number
    low: number
    medium: number
    high: number
    retrograde: number
  }
  altitude: {
    vleo: number
    leo: number
    meo: number
    heo: number
    geo: number
    beyond: number
  }
  constellation: Record<string, number>
  hardware: Record<string, number>
  reentry: { critical: number; high: number; medium: number; normal: number; nodata: number }
  orbitClass: Record<string, number>
}