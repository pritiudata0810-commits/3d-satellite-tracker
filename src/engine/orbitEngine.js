import * as satellite from 'satellite.js'

export function calculatePositions(tleArray, when = new Date()) {
  const positions = []

  tleArray.forEach((sat) => {
    try {
      const satrec = satellite.twoline2satrec(sat.TLE_LINE1, sat.TLE_LINE2)
      const posVel = satellite.propagate(satrec, when)

      if (!posVel || !posVel.position) return

      const gmst = satellite.gstime(when)
      const geo = satellite.eciToGeodetic(posVel.position, gmst)

      const lat = satellite.degreesLat(geo.latitude)
      const lng = satellite.degreesLong(geo.longitude)
      const altKm = geo.height
      const alt = altKm / 6371

      if (isNaN(lat) || isNaN(lng) || alt < 0) return

      const inclination = satellite.radiansToDegrees(satrec.inclo)

      positions.push({
        name: sat.OBJECT_NAME,
        lat,
        lng,
        alt,
        altKm: Math.round(altKm),
        inclination: Math.round(inclination * 10) / 10,
      })
    } catch {
      /* skip bad TLE */
    }
  })

  return positions
}

export function inclinationHistogram(positions) {
  const buckets = {
    equatorial: 0,
    low: 0,
    medium: 0,
    high: 0,
    retrograde: 0,
  }
  for (const p of positions) {
    const i = p.inclination
    if (i < 30) buckets.equatorial++
    else if (i < 60) buckets.low++
    else if (i < 90) buckets.medium++
    else if (i < 120) buckets.high++
    else buckets.retrograde++
  }
  const n = positions.length || 1
  const pct = (c) => ((100 * c) / n).toFixed(1)
  return { buckets, total: positions.length, pct }
}
