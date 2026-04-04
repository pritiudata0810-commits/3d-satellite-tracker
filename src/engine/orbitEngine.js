import satellite from 'satellite.js'

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

      if (isNaN(lat) || isNaN(lng)) return

      positions.push({
        name: sat.OBJECT_NAME,
        lat: lat,
        lng: lng,
        alt: geo.height / 6371,
      })
    } catch (e) {
      // skip
    }
  })

  return positions
}