import * as satellite from 'satellite.js'

export function calculatePositions(tleArray) {
  const now = new Date()
  const positions = []

  tleArray.forEach((sat) => {
    try {
      const satrec = satellite.twoline2satrec(sat.TLE_LINE1, sat.TLE_LINE2)
      const posVel = satellite.propagate(satrec, now)
      if (!posVel || !posVel.position) return

      const gmst = satellite.gstime(now)
      const geo = satellite.eciToGeodetic(posVel.position, gmst)

      const lat = satellite.degreesLat(geo.latitude)
      const lng = satellite.degreesLong(geo.longitude)
      const altKm = geo.height
      const inclination = satrec.inclo * (180 / Math.PI)

      if (isNaN(lat) || isNaN(lng) || altKm < 0) return

      positions.push({
        name: sat.OBJECT_NAME,
        lat,
        lng,
        alt: altKm / 6371,
        altKm: Math.round(altKm),
        inclination: Math.round(inclination * 10) / 10,
      })
    } catch (e) { }
  })

  return positions
}