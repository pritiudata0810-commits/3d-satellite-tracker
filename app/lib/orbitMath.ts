import * as satellite from 'satellite.js'
import type { TleRecord } from './types'

/** Sub-satellite path on Earth surface for one orbital period (closed loop). */
export function sampleGroundTrackRing(
  tle: TleRecord,
  start: Date,
  steps = 128
): [number, number, number][] {
  try {
    const satrec = satellite.twoline2satrec(tle.TLE_LINE1, tle.TLE_LINE2)
    const periodMin = satrec.no > 1e-9 ? (2 * Math.PI) / satrec.no : 90
    const ms = (periodMin * 60 * 1000) / steps
    const pts: [number, number, number][] = []
    for (let i = 0; i <= steps; i++) {
      const t = new Date(start.getTime() + i * ms)
      const pv = satellite.propagate(satrec, t)
      if (!pv?.position) continue
      const gmst = satellite.gstime(t)
      const geo = satellite.eciToGeodetic(pv.position, gmst)
      const lat = satellite.degreesLat(geo.latitude)
      const lng = satellite.degreesLong(geo.longitude)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        pts.push([lat, lng, 0.0025])
      }
    }
    if (pts.length > 2 && pts[0] && pts[pts.length - 1]) {
      pts.push([pts[0][0], pts[0][1], pts[0][2]])
    }
    return pts
  } catch {
    return []
  }
}
