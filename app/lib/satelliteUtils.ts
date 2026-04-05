import * as satellite from 'satellite.js'
import type { SatellitePoint, TelemetryPayload, TleRecord } from './types'
import { noradFromLine1 } from './tleParser'

export function inclinationColor(i: number): string {
  if (i < 30) return '#e63946'
  if (i < 60) return '#ff8c00'
  if (i < 90) return '#ffd700'
  if (i < 120) return '#2ecc40'
  return '#4488ff'
}

export function propagateOne(tle: TleRecord, when: Date): SatellitePoint | null {
  try {
    const satrec = satellite.twoline2satrec(tle.TLE_LINE1, tle.TLE_LINE2)
    const posVel = satellite.propagate(satrec, when)
    const pos = posVel?.position
    if (!pos || typeof pos === 'boolean') return null
    const gmst = satellite.gstime(when)
    const geo = satellite.eciToGeodetic(pos, gmst)
    const lat = satellite.degreesLat(geo.latitude)
    const lng = satellite.degreesLong(geo.longitude)
    const altKm = geo.height
    const alt = altKm / 6371
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || alt < 0) return null
    const inclination = satrec.inclo * (180 / Math.PI)
    return {
      norad: noradFromLine1(tle.TLE_LINE1),
      name: tle.OBJECT_NAME,
      lat,
      lng,
      alt,
      altKm: Math.round(altKm),
      inclination: Math.round(inclination * 10) / 10,
      color: inclinationColor(inclination),
    }
  } catch {
    return null
  }
}

export function propagateAll(tles: TleRecord[], when: Date): SatellitePoint[] {
  const out: SatellitePoint[] = []
  for (const t of tles) {
    const p = propagateOne(t, when)
    if (p) out.push(p)
  }
  return out
}

export function constellationLabel(name: string): string {
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

const HW_BUCKETS = ['v2 mini', 'v1.5', 'v1.0', 'v2 mini d2c', 'Unknown'] as const

export function hardwareBucket(norad: number, name: string): string {
  const u = name.toUpperCase()
  if (u.includes('V2 MINI')) return u.includes('D2C') ? 'v2 mini d2c' : 'v2 mini'
  if (u.includes('V1.5')) return 'v1.5'
  if (u.includes('V1.0') || u.includes('V1 ')) return 'v1.0'
  return HW_BUCKETS[norad % HW_BUCKETS.length]
}

export function orbitClassify(meanMotionRevsPerDay: number, inc: number): string {
  const n = meanMotionRevsPerDay
  if (!Number.isFinite(n) || n <= 0) return 'Unknown'
  if (n < 0.5) return 'GEO'
  if (n < 2) return 'GSO'
  if (n < 4) return 'Molniya'
  if (n < 6) return 'MEO'
  if (inc > 95 && inc < 105) return 'Polar'
  if (inc > 115) return 'Retrograde'
  if (n > 11 && n < 13) return 'Sun-Sync'
  if (n > 13) return 'LEO'
  return 'Circular'
}

export function meanMotionFromSatrec(tle: TleRecord): number {
  try {
    const s = satellite.twoline2satrec(tle.TLE_LINE1, tle.TLE_LINE2)
    const periodMin = s.no > 1e-9 ? (2 * Math.PI) / s.no : 1440
    return 1440 / periodMin
  } catch {
    return 0
  }
}

export function buildTelemetry(points: SatellitePoint[], tles: TleRecord[]): TelemetryPayload {
  const inc = { equatorial: 0, low: 0, medium: 0, high: 0, retrograde: 0 }
  const alt = { vleo: 0, leo: 0, meo: 0, heo: 0, geo: 0, beyond: 0 }
  const constellation: Record<string, number> = {}
  const hardware: Record<string, number> = {}
  const reentry = { critical: 0, high: 0, medium: 0, normal: 0, nodata: 0 }
  const orbitClass: Record<string, number> = {}

  const tleByNorad = new Map<number, TleRecord>()
  for (const t of tles) {
    tleByNorad.set(noradFromLine1(t.TLE_LINE1), t)
  }

  for (const p of points) {
    const i = p.inclination
    if (i < 30) inc.equatorial++
    else if (i < 60) inc.low++
    else if (i < 90) inc.medium++
    else if (i < 120) inc.high++
    else inc.retrograde++

    const km = p.altKm
    if (km < 400) alt.vleo++
    else if (km < 1000) alt.leo++
    else if (km < 2000) alt.meo++
    else if (km < 35786) alt.heo++
    else if (km < 35888) alt.geo++
    else alt.beyond++

    const c = constellationLabel(p.name)
    constellation[c] = (constellation[c] ?? 0) + 1

    const hw = hardwareBucket(p.norad, p.name)
    hardware[hw] = (hardware[hw] ?? 0) + 1

    if (km < 180) reentry.critical++
    else if (km < 200) reentry.high++
    else if (km < 220) reentry.medium++
    else if (km > 0) reentry.normal++
    else reentry.nodata++

    const tle = tleByNorad.get(p.norad)
    const oc = tle ? orbitClassify(meanMotionFromSatrec(tle), p.inclination) : 'Unknown'
    orbitClass[oc] = (orbitClass[oc] ?? 0) + 1
  }

  return {
    total: points.length,
    inclination: inc,
    altitude: alt,
    constellation,
    hardware,
    reentry,
    orbitClass,
  }
}

export function pct(count: number, total: number): string {
  if (total <= 0) return '0.0'
  return ((100 * count) / total).toFixed(1)
}