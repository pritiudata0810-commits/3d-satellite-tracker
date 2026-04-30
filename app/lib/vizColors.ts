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

/** Numeric hex colors for renderer compatibility */
const CONSTELLATION_HEX: Record<string, number> = {
  Starlink: 0x4488ff,
  Kuiper: 0xff8c00,
  Oneweb: 0x7cfc7c,
  Iridium: 0xffd700,
  GPS: 0xe63946,
  Globalstar: 0xff44ff,
  Galileo: 0x44ffff,
  Glonass: 0xfa8072,
  Beidou: 0xdaa520,
  Qianfan: 0xa855f7,
  Other: 0x9ca3af,
}

function altitudeColor(km: number): number {
  if (km < 400) return 0xe63946
  if (km < 1000) return 0xff8c00
  if (km < 2000) return 0xffd700
  if (km < 35786) return 0x2ecc40
  if (km < 35888) return 0x4488ff
  return 0x8844ff
}

const HW_COLORS: Record<string, number> = {
  'v2 mini': 0x22c55e,
  'v1.5': 0x3b82f6,
  'v1.0': 0xe63946,
  'v2 mini d2c': 0xf59e0b,
  Unknown: 0x9ca3af,
}

function reentryColor(km: number): number {
  if (km < 180) return 0xe63946
  if (km < 200) return 0xff4500
  if (km < 220) return 0xff8c00
  return 0x52525b
}

const FCC_PALETTE: number[] = [
  0x4488ff,
  0xff8c00,
  0xa855f7,
  0x22c55e,
  0xec4899,
  0xf87171,
  0x22d3ee,
  0xeab308,
  0x86efac,
  0xea580c,
  0x93c5fd,
  0xfdba74,
  0xca8a04,
  0x14b8a6,
  0xffffff,
]

const ORBIT_HEX: Record<string, number> = {
  Molniya: 0xec4899,
  'Semi-Sync': 0xff8c00,
  OneWeb: 0x22d3ee,
  GNSS: 0xffd700,
  'Sun-Sync': 0xca8a04,
  GEO: 0xe63946,
  GSO: 0xa855f7,
  'HEO Elliptical': 0x4ade80,
  HEO: 0x86efac,
  Polar: 0x93c5fd,
  Retrograde: 0xc026d3,
  Elliptical: 0x71717a,
  Circular: 0xbbf7d0,
  MEO: 0x06b6d4,
  LEO: 0x3b82f6,
  Unknown: 0xffffff,
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