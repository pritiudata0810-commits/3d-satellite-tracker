import * as satellite from 'satellite.js'
import type { TleRecord } from './types'
import { noradFromLine1 } from './tleParser'

type WorkerRequest = {
  tles: TleRecord[]
  timestamp: number
}

type WorkerResponse = {
  timestamp: number
  count: number
  payload: Float32Array
  norads: Uint32Array
  names: string[]
}

function propagateBatch(tles: TleRecord[], when: Date): WorkerResponse {
  const count = tles.length
  const payload = new Float32Array(count * 5)
  const norads = new Uint32Array(count)
  const names: string[] = new Array(count)
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
      const base = valid * 5
      payload[base] = lat
      payload[base + 1] = lng
      payload[base + 2] = alt
      payload[base + 3] = altKm
      payload[base + 4] = inclination
      norads[valid] = noradFromLine1(entry.TLE_LINE1)
      names[valid] = entry.OBJECT_NAME || ''
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
    }
  }

  return { timestamp: when.getTime(), count, payload, norads, names }
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { tles, timestamp } = event.data
  const when = new Date(timestamp)
  const response = propagateBatch(tles, when)
  ;(self as any).postMessage(response, [response.payload.buffer, response.norads.buffer])
})
