import * as satellite from 'satellite.js'
import type { TleRecord } from './types'
import { noradFromLine1 } from './tleParser'

type WorkerRequest = {
  tles: TleRecord[]
  timestamp: number
  vizMode: number
}

type WorkerResponse = {
  timestamp: number
  count: number
  payload: Float32Array
  norads: Uint32Array
  names: string[]
  colors: string[]
}

function inclinationColor(i: number): string {
  if (i < 30) return '#e63946'
  if (i < 60) return '#ff8c00'
  if (i < 90) return '#ffd700'
  if (i < 120) return '#2ecc40'
  return '#4488ff'
}

function constellationLabel(name: string): string {
  const u = name.toUpperCase()
  if (u.includes('STARLINK')) return 'Starlink'
  if (u.includes('ONEWEB')) return 'Oneweb'
  if (u.includes('IRIDIUM')) return 'Iridium'
  if (u.includes('GPS') || u.includes('NAVSTAR')) return 'GPS'
  if (u.includes('GLONASS')) return 'Glonass'
  if (u.includes('GALILEO')) return 'Galileo'
  if (u.includes('BEIDOU') || u.includes('BEI DOU')) return 'Beidou'
  if (u.includes('KUIPER')) return 'Kuiper'
  if (u.includes('GLOBALSTAR')) return 'Globalstar'
  return 'Other'
}

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

function hardwareBucket(norad: number, name: string): string {
  const u = name.toUpperCase()
  if (u.includes('V2 MINI')) return u.includes('D2C') ? 'v2 mini d2c' : 'v2 mini'
  if (u.includes('V1.5')) return 'v1.5'
  if (u.includes('V1.0') || u.includes('V1 ')) return 'v1.0'
  return 'Unknown'
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

function meanMotionFromSatrec(tle: TleRecord): number {
  try {
    const s = satellite.twoline2satrec(tle.TLE_LINE1, tle.TLE_LINE2)
    const periodMin = s.no > 1e-9 ? (2 * Math.PI) / s.no : 1440
    return 1440 / periodMin
  } catch {
    return 0
  }
}

function orbitLabelForViz(tle: TleRecord, p: any): string {
  const u = tle.OBJECT_NAME.toUpperCase()
  if (u.includes('ONEWEB')) return 'OneWeb'
  if (/GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU|BEI DOU/.test(u)) return 'GNSS'

  const n = meanMotionFromSatrec(tle)
  const inc = p.inclination
  if (!Number.isFinite(n) || n <= 0) return 'Unknown'
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

const colorCache = new Map<string, string>()

function pointVizColor(mode: number, p: any, tle: TleRecord): string {
  let key: string | null = null
  switch (mode) {
    case 0: // inclination
      key = `${p.norad}-inc-${Math.round(p.inclination * 10) / 10}`
      break
    case 1: // constellation
      key = `${p.norad}-const-${p.name}`
      break
    case 3: // hardware
      key = `${p.norad}-hw-${p.name}`
      break
    case 5: // FCC
      key = `${p.norad}-fcc`
      break
    // others depend on position or tle, don't cache
  }
  if (key && colorCache.has(key)) {
    return colorCache.get(key)!
  }
  let color: string
  switch (mode) {
    case 0:
      color = inclinationColor(p.inclination)
      break
    case 1: {
      const lab = constellationLabel(p.name)
      color = CONSTELLATION_HEX[lab] ?? CONSTELLATION_HEX.Other
      break
    }
    case 2:
      color = altitudeColor(p.altKm)
      break
    case 3: {
      const b = hardwareBucket(p.norad, p.name)
      color = HW_COLORS[b] ?? HW_COLORS.Unknown
      break
    }
    case 4:
      color = reentryColor(p.altKm)
      break
    case 5:
      color = FCC_PALETTE[p.norad % FCC_PALETTE.length]
      break
    case 6: {
      const lab = orbitLabelForViz(tle, p)
      color = ORBIT_HEX[lab] ?? ORBIT_HEX.Unknown
      break
    }
    default:
      color = inclinationColor(p.inclination)
  }
  if (key) {
    colorCache.set(key, color)
  }
  return color
}

function propagateBatch(tles: TleRecord[], when: Date, vizMode: number): WorkerResponse {
  const count = tles.length
  const payload = new Float32Array(count * 5)
  const norads = new Uint32Array(count)
  const names: string[] = new Array(count)
  const colors: string[] = new Array(count)
  let valid = 0

  for (let i = 0; i < count; i++) {
    const entry = tles[i]
    try {
      const satrec = satellite.twoline2satrec(entry.TLE_LINE1, entry.TLE_LINE2)
      const posVel = satellite.propagate(satrec, when)
      const pos = posVel?.position
      if (!pos || typeof pos === 'boolean') continue

      const gmst = satellite.gstime(when)
      const geo = satellite.eciToGeodetic(pos, gmst)
      const lat = satellite.degreesLat(geo.latitude)
      const lng = satellite.degreesLong(geo.longitude)
      const altKm = geo.height
      const alt = altKm / 6371
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || alt < 0) continue

      const inclination = (satrec.inclo * 180) / Math.PI
      const p = { norad: noradFromLine1(entry.TLE_LINE1), name: entry.OBJECT_NAME, lat, lng, alt, altKm, inclination, baseColor: color }
      const base = valid * 5
      payload[base] = lat
      payload[base + 1] = lng
      payload[base + 2] = alt
      payload[base + 3] = altKm
      payload[base + 4] = inclination
      norads[valid] = p.norad
      names[valid] = p.name
      colors[valid] = color
      valid += 1
    } catch {
      continue
    }
  }

  if (valid !== count) {
    return {
      timestamp: when.getTime(),
      count: valid,
      payload: payload.subarray(0, valid * 5),
      norads: norads.subarray(0, valid),
      names: names.slice(0, valid),
      colors: colors.slice(0, valid),
    }
  }

  return { timestamp: when.getTime(), count, payload, norads, names, colors }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { tles, timestamp, vizMode } = event.data
  const when = new Date(timestamp)
  const response = propagateBatch(tles, when, vizMode)
  ;(self as any).postMessage(response, [response.payload.buffer, response.norads.buffer])
})
