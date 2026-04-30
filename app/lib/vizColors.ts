import type { SatellitePoint, TleRecord } from './types'
import {
  inclinationColor,
  constellationLabel,
  hardwareBucket,
  meanMotionFromSatrec,
} from './satelliteUtils'

/** Matches right-sidebar slide order (0–6). */
export const VIZ_MODE_INCLINATION = 0
export const VIZ_MODE_CONSTELLATION = 1
export const VIZ_MODE_ALTITUDE = 2
export const VIZ_MODE_HARDWARE = 3
export const VIZ_MODE_REENTRY = 4
export const VIZ_MODE_STARLINK_FCC = 5
export const VIZ_MODE_ORBIT = 6

/** Convert hex string -> numeric color for Three.js */
function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

/** Align with Sidebar constellation swatches. */
const CONSTELLATION_HEX: Record<string, number> = {
  Starlink: hexToNumber('#4488ff'),
  Kuiper: hexToNumber('#ff8c00'),
  Oneweb: hexToNumber('#7cfc7c'),
  Iridium: hexToNumber('#ffd700'),
  GPS: hexToNumber('#e63946'),
  Globalstar: hexToNumber('#ff44ff'),
  Galileo: hexToNumber('#44ffff'),
  Glonass: hexToNumber('#fa8072'),
  Beidou: hexToNumber('#daa520'),
  Qianfan: hexToNumber('#a855f7'),
  Other: hexToNumber('#9ca3af'),
}

function altitudeColor(km: number): number {
  if (km < 400) return hexToNumber('#e63946')
  if (km < 1000) return hexToNumber('#ff8c00')
  if (km < 2000) return hexToNumber('#ffd700')
  if (km < 35786) return hexToNumber('#2ecc40')
  if (km < 35888) return hexToNumber('#4488ff')
  return hexToNumber('#8844ff')
}

const HW_COLORS: Record<string, number> = {
  'v2 mini': hexToNumber('#22c55e'),
  'v1.5': hexToNumber('#3b82f6'),
  'v1.0': hexToNumber('#e63946'),
  'v2 mini d2c': hexToNumber('#f59e0b'),
  Unknown: hexToNumber('#9ca3af'),
}

function reentryColor(km: number): number {
  if (km < 180) return hexToNumber('#e63946')
  if (km < 200) return hexToNumber('#ff4500')
  if (km < 220) return hexToNumber('#ff8c00')
  return hexToNumber('#52525b')
}

const FCC_PALETTE: number[] = [
  hexToNumber('#4488ff'),
  hexToNumber('#ff8c00'),
  hexToNumber('#a855f7'),
  hexToNumber('#22c55e'),
  hexToNumber('#ec4899'),
  hexToNumber('#f87171'),
  hexToNumber('#22d3ee'),
  hexToNumber('#eab308'),
  hexToNumber('#86efac'),
  hexToNumber('#ea580c'),
  hexToNumber('#93c5fd'),
  hexToNumber('#fdba74'),
  hexToNumber('#ca8a04'),
  hexToNumber('#14b8a6'),
  hexToNumber('#ffffff'),
]

const ORBIT_HEX: Record<string, number> = {
  Molniya: hexToNumber('#ec4899'),
  'Semi-Sync': hexToNumber('#ff8c00'),
  OneWeb: hexToNumber('#22d3ee'),
  GNSS: hexToNumber('#ffd700'),
  'Sun-Sync': hexToNumber('#ca8a04'),
  GEO: hexToNumber('#e63946'),
  GSO: hexToNumber('#a855f7'),
  'HEO Elliptical': hexToNumber('#4ade80'),
  HEO: hexToNumber('#86efac'),
  Polar: hexToNumber('#93c5fd'),
  Retrograde: hexToNumber('#c026d3'),
  Elliptical: hexToNumber('#71717a'),
  Circular: hexToNumber('#bbf7d0'),
  MEO: hexToNumber('#06b6d4'),
  LEO: hexToNumber('#3b82f6'),
  Unknown: hexToNumber('#ffffff'),
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

export function pointVizColor(
  mode: number,
  p: SatellitePoint,
  tle: TleRecord | undefined
): number {
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