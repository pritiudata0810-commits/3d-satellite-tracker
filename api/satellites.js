export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 's-maxage=1800')
  
    const tag = (name = '') => {
      const n = name.toUpperCase()
      if (n.includes('STARLINK'))                     return 'Starlink'
      if (n.includes('GPS') || n.includes('NAVSTAR')) return 'GPS'
      if (n.includes('GLONASS'))                      return 'GLONASS'
      if (n.includes('ONEWEB'))                       return 'OneWeb'
      if (n.includes('IRIDIUM'))                      return 'Iridium'
      if (n.includes('ISS') || n.includes('ZARYA'))   return 'ISS'
      if (n.includes('GALILEO'))                      return 'Galileo'
      if (n.includes('BEIDOU'))                       return 'BeiDou'
      return 'Other'
    }
  
    const fetchGroup = async (group) => {
      try {
        const r = await fetch(
          `https://celestrak.org/gp.php?GROUP=${group}&FORMAT=json`,
          { headers: { 'User-Agent': 'satellite-tracker-app' } }
        )
        if (!r.ok) return []
        const json = await r.json()
        return Array.isArray(json) ? json : []
      } catch {
        return []
      }
    }
  
    try {
      const groups = [
        'starlink', 'active', 'gps-ops', 'glonass-ops',
        'galileo', 'beidou', 'oneweb', 'iridium', 'stations'
      ]
  
      const results = await Promise.all(groups.map(fetchGroup))
      const all = results.flat()
  
      const seen = new Set()
      const unique = all.filter(s => {
        if (!s.TLE_LINE1 || !s.TLE_LINE2) return false
        const id = s.NORAD_CAT_ID || s.OBJECT_NAME
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
  
      const data = unique.map(s => ({
        OBJECT_NAME:   s.OBJECT_NAME || 'UNKNOWN',
        TLE_LINE1:     s.TLE_LINE1,
        TLE_LINE2:     s.TLE_LINE2,
        CONSTELLATION: tag(s.OBJECT_NAME || ''),
      }))
  
      console.log(`✅ Satellites served: ${data.length}`)
      return res.status(200).json(data)
  
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }