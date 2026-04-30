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
  colors: number[]  // FIX: was string[], now number[] for fast setHex()
}

function inclinationColor(i: number): number {
  if (i < 30) return 0xe63946
  if (i < 60) return 0xff8c00
  if (i < 90) return 0xffd700
  if (i < 120) return 0x2ecc40
  return 0x4488ff
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

const CONSTELLATION_HEX: Record<string, number> = {
  Starlink:   0x4488ff,
  Kuiper:     0xff8c00,
  Oneweb:     0x7cfc7c,
  Iridium:    0xffd700,
  GPS:        0xe63946,
  Globalstar: 0xff44ff,
  Galileo:    0x44ffff,
  Glonass:    0xfa8072,
  Beidou:     0xdaa520,
  Qianfan:    0xa855f7,
  Other:      0x9ca3af,
}

function altitudeColor(km: number): number {
  if (km < 400)   return 0xe63946
  if (km < 1000)  return 0xff8c00
  if (km < 2000)  return 0xffd700
  if (km < 35786) return 0x2ecc40
  if (km < 35888) return 0x4488ff
  return 0x8844ff
}

const HW_COLORS: Record<string, number> = {
  'v2 mini':     0x22c55e,
  'v1.5':        0x3b82f6,
  'v1.0':        0xe63946,
  'v2 mini d2c': 0xf59e0b,
  Unknown:       0x9ca3af,
}

function hardwareBucket(norad: number, name: string): string {
  const u = name.toUpperCase()
  if (u.includes('V2 MINI')) return u.includes('D2C') ? 'v2 mini d2c' : 'v2 mini'
  if (u.includes('V1.5')) return 'v1.5'
  if (u.includes('V1.0') || u.includes('V1 ')) return 'v1.0'
  return 'Unknown'
}

function reentryColor(km: number): number {
  if (km < 180) return 0xe63946
  if (km < 200) return 0xff4500
  if (km < 220) return 0xff8c00
  return 0x52525b
}

const FCC_PALETTE: number[] = [
  0x4488ff, 0xff8c00, 0xa855f7, 0x22c55e, 0xec4899,
  0xf87171, 0x22d3ee, 0xeab308, 0x86efac, 0xea580c,
  0x93c5fd, 0xfdba74, 0xca8a04, 0x14b8a6, 0xffffff,
]

const ORBIT_HEX: Record<string, number> = {
  Molniya:        0xec4899,
  'Semi-Sync':    0xff8c00,
  OneWeb:         0x22d3ee,
  GNSS:           0xffd700,
  'Sun-Sync':     0xca8a04,
  GEO:            0xe63946,
  GSO:            0xa855f7,
  'HEO Elliptical': 0x4ade80,
  HEO:            0x86efac,
  Polar:          0x93c5fd,
  Retrograde:     0xc026d3,
  Elliptical:     0x71717a,
  Circular:       0xbbf7d0,
  MEO:            0x06b6d4,
  LEO:            0x3b82f6,
  Unknown:        0xffffff,
}

// FIX: removed meanMotionFromSatrec() — it was calling twoline2satrec() a second time
// inside the loop. Now satrec is passed directly from propagateBatch.
function orbitLabelForViz(tle: TleRecord, p: any, satrec: any): string {
  const u = tle.OBJECT_NAME.toUpperCase()
  if (u.includes('ONEWEB')) return 'OneWeb'
  if (/GPS|NAVSTAR|GLONASS|GALILEO|BEIDOU|BEI DOU/.test(u)) return 'GNSS'

  // FIX: use already-computed satrec — no second twoline2satrec call
  const periodMin = satrec.no > 1e-9 ? (2 * Math.PI) / satrec.no : 1440
  const n = 1440 / periodMin
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

// FIX: colorCache now stores number instead of string
const colorCache = new Map<string, number>()

// FIX: returns number instead of string; satrec passed in to avoid double-parse
function pointVizColor(mode: number, p: any, tle: TleRecord, satrec: any): number {
  let key: string | null = null
  switch (mode) {
    case 0:
      key = `${p.norad}-inc-${Math.round(p.inclination * 10) / 10}`
      break
    case 1:
      key = `${p.norad}-const-${p.name}`
      break
    case 3:
      key = `${p.norad}-hw-${p.name}`
      break
    case 5:
      key = `${p.norad}-fcc`
      break
  }
  if (key && colorCache.has(key)) {
    return colorCache.get(key)!
  }
  let color: number
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
      // FIX: pass satrec so orbitLabelForViz doesn't re-parse TLE
      const lab = orbitLabelForViz(tle, p, satrec)
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
  const colors: number[] = new Array(count)  // FIX: number[]
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
      const norad = noradFromLine1(entry.TLE_LINE1)

      // FIX: build p first, THEN compute color using p (was backwards before — color was undefined)
      const p = { norad, name: entry.OBJECT_NAME, lat, lng, alt, altKm, inclination }
      const color = pointVizColor(vizMode, p, entry, satrec)  // FIX: pass satrec

      const base = valid * 5
      payload[base]     = lat
      payload[base + 1] = lng
      payload[base + 2] = alt
      payload[base + 3] = altKm
      payload[base + 4] = inclination
      norads[valid] = norad
      names[valid]  = p.name
      colors[valid] = color  // FIX: now correctly assigned number
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