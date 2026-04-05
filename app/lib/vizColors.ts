import type { SatellitePoint, TleRecord } from './types'
import { inclinationColor, constellationLabel, hardwareBucket, meanMotionFromSatrec } from './satelliteUtils'

/** Matches right-sidebar slide order (0–6). */
export const VIZ_MODE_INCLINATION = 0
export const VIZ_MODE_CONSTELLATION = 1
export const VIZ_MODE_ALTITUDE = 2
export const VIZ_MODE_HARDWARE = 3
export const VIZ_MODE_REENTRY = 4
export const VIZ_MODE_STARLINK_FCC = 5
export const VIZ_MODE_ORBIT = 6

/** Align with Sidebar constellation swatches. */
const CONSTELLATION_HEX: Record<string, string> = {
  Starlink: '#4488ff',
  Kuiper: '#ff8c00',
  Oneweb: '#7cfc7c',
  Iridium: '#ffd700',
  GPS: '#e63946',
  Globalstar: '#ff44ff',
  Galileo: '#44ffff',
  Glonass: '#fa8072',
  Beidou: '#daa520',
  Qianfan: '#a855f7',
  Other: '#9ca3af',
}

function altitudeColor(km: number): string {
  if (km < 400) return '#e63946'
  if (km < 1000) return '#ff8c00'
  if (km < 2000) return '#ffd700'
  if (km < 35786) return '#2ecc40'
  if (km < 35888) return '#4488ff'
  return '#8844ff'
}

const HW_COLORS: Record<string, string> = {
  'v2 mini': '#22c55e',
  'v1.5': '#3b82f6',
  'v1.0': '#e63946',
  'v2 mini d2c': '#f59e0b',
  Unknown: '#9ca3af',
}

function reentryColor(km: number): string {
  if (km < 180) return '#e63946'
  if (km < 200) return '#ff4500'
  if (km < 220) return '#ff8c00'
  return '#52525b'
}

const FCC_PALETTE = [
  '#4488ff',
  '#ff8c00',
  '#a855f7',
  '#22c55e',
  '#ec4899',
  '#f87171',
  '#22d3ee',
  '#eab308',
  '#86efac',
  '#ea580c',
  '#93c5fd',
  '#fdba74',
  '#ca8a04',
  '#14b8a6',
  '#ffffff',
]

const ORBIT_HEX: Record<string, string> = {
  Molniya: '#ec4899',
  'Semi-Sync': '#ff8c00',
  OneWeb: '#22d3ee',
  GNSS: '#ffd700',
  'Sun-Sync': '#ca8a04',
  GEO: '#e63946',
  GSO: '#a855f7',
  'HEO Elliptical': '#4ade80',
  HEO: '#86efac',
  Polar: '#93c5fd',
  Retrograde: '#c026d3',
  Elliptical: '#71717a',
  Circular: '#bbf7d0',
  MEO: '#06b6d4',
  LEO: '#3b82f6',
  Unknown: '#ffffff',
}

/** Orbit label + color aligned with Sidebar "Orbit" slide (heuristic). */
function orbitLabelForViz(tle: TleRecord, p: SatellitePoint): string {
  const u = tle.OBJECT_NAME.toUpperCase()
  if (u.includes('ONEWEB')) return 'OneWeb'
  if (/GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU|BEI DOU/.test(u)) return 'GNSS'

  const n = meanMotionFromSatrec(tle)
  const inc = p.inclination
  if (!Number.isFinite(n) || n <= 0) return 'Unknown'
  if (n < 0.5) return 'GEO'
  if (n < 1.05) return 'GSO'
  if (n >= 1.85 && n <= 2.15) return 'Semi-Sync'
  if (n < 4) return 'Molniya'
  if (n < 6) {
    if (p.altKm > 20000) return 'HEO Elliptical'
    return 'MEO'
  }
  if (inc > 95 && inc < 105) return 'Polar'
  if (inc > 115) return 'Retrograde'
  if (n > 11 && n < 13) return 'Sun-Sync'
  if (n > 13) return 'LEO'
  return 'Elliptical'
}

export function pointVizColor(mode: number, p: SatellitePoint, tle: TleRecord | undefined): string {
  switch (mode) {
    case VIZ_MODE_INCLINATION:
      return inclinationColor(p.inclination)
    case VIZ_MODE_CONSTELLATION: {
      const lab = constellationLabel(p.name)
      return CONSTELLATION_HEX[lab] ?? CONSTELLATION_HEX.Other
    }
    case VIZ_MODE_ALTITUDE:
      return altitudeColor(p.altKm)
    case VIZ_MODE_HARDWARE: {
      const b = hardwareBucket(p.norad, p.name)
      return HW_COLORS[b] ?? HW_COLORS.Unknown
    }
    case VIZ_MODE_REENTRY:
      return reentryColor(p.altKm)
    case VIZ_MODE_STARLINK_FCC:
      return FCC_PALETTE[p.norad % FCC_PALETTE.length]
    case VIZ_MODE_ORBIT: {
      if (!tle) return ORBIT_HEX.Unknown
      const lab = orbitLabelForViz(tle, p)
      return ORBIT_HEX[lab] ?? ORBIT_HEX.Unknown
    }
    default:
      return inclinationColor(p.inclination)
  }
}
