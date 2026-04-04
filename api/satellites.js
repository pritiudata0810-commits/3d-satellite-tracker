export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
  
    const fetchGroup = async (search, page = 1, size = 500) => {
      try {
        const r = await fetch(
          `https://tle.ivanstanojevic.me/api/tle/?search=${search}&page=${page}&page-size=${size}`,
          { headers: { 'User-Agent': 'satellite-tracker' } }
        )
        const json = await r.json()
        return json.member || []
      } catch { return [] }
    }
  
    try {
      const [sl1, sl2, sl3, sl4, gps, glonass, oneweb, iridium, stations] = await Promise.all([
        fetchGroup('STARLINK', 1, 500),
        fetchGroup('STARLINK', 2, 500),
        fetchGroup('STARLINK', 3, 500),
        fetchGroup('STARLINK', 4, 500),
        fetchGroup('GPS', 1, 100),
        fetchGroup('GLONASS', 1, 100),
        fetchGroup('ONEWEB', 1, 200),
        fetchGroup('IRIDIUM', 1, 100),
        fetchGroup('ISS', 1, 20),
      ])
  
      const all = [...sl1, ...sl2, ...sl3, ...sl4, ...gps, ...glonass, ...oneweb, ...iridium, ...stations]
  
      const seen = new Set()
      const unique = all.filter(s => {
        if (seen.has(s.satelliteId)) return false
        seen.add(s.satelliteId)
        return true
      })
  
      const data = unique.map(s => ({
        OBJECT_NAME: s.name,
        TLE_LINE1: s.line1,
        TLE_LINE2: s.line2,
      }))
  
      res.status(200).json(data)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  }