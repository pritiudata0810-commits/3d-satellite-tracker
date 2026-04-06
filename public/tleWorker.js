importScripts('https://cdn.jsdelivr.net/npm/satellite.js@4.1.4/dist/satellite.min.js')

function noradFromLine1(line1) {
  const n = parseInt(line1.substring(2, 7).trim(), 10)
  return Number.isFinite(n) ? n : 0
}

function propagateBatch(tles, when) {
  const count = tles.length
  const payload = new Float32Array(count * 5)
  const norads = new Uint32Array(count)
  const names = new Array(count)
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
    } catch (error) {
      continue
    }
  }

  return {
    timestamp: when.getTime(),
    count: valid,
    payload: payload.subarray(0, valid * 5),
    norads: norads.subarray(0, valid),
    names: names.slice(0, valid),
  }
}

self.addEventListener('message', (event) => {
  const { tles, timestamp } = event.data
  const when = new Date(timestamp)
  const response = propagateBatch(tles, when)
  self.postMessage(response, [response.payload.buffer, response.norads.buffer])
})
