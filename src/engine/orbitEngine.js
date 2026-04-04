import * as satellite from 'satellite.js'

export function calculatePositions(tleArray) {
  const now = new Date()
  const positions = []

  tleArray.forEach((sat) => {
    try {
      const satrec = satellite.twoline2satrec(sat.TLE_LINE1, sat.TLE_LINE2)
      const posVel = satellite.propagate(satrec, now)

      if (!posVel.position) return

      const gmst = satellite.gstime(now)
      const geo = satellite.eciToGeodetic(posVel.position, gmst)

      positions.push({
        name: sat.OBJECT_NAME,
        lat: satellite.degreesLat(geo.latitude),
        lng: satellite.degreesLong(geo.longitude),
        alt: geo.height / 6371,
      })
    } catch (e) {
      // skip bad satellites
    }
  })

  return positions
}