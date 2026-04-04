export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 's-maxage=1800')
  
    const LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
    const DATA_URL = 'https://www.space-track.org/basicspacedata/query/class/gp/EPOCH/%3Enow-30/MEAN_MOTION/%3E11.25/ECCENTRICITY/%3C0.25/orderby/NORAD_CAT_ID/format/json'
  
    // Try space-track.org first (10,000+ satellites)
    try {
      const user = process.env.SPACETRACK_USER
      const pass = process.env.SPACETRACK_PASS
  
      if (user && pass) {
        const loginRes = await fetch(LOGIN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `identity=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&query=${encodeURIComponent(DATA_URL)}`,
        })
        const rawText = await loginRes.text()
        const data = JSON.parse(rawText)
  
        if (Array.isArray(data) && data.length > 100) {
          const formatted = data
            .filter(s => s.TLE_LINE1 && s.TLE_LINE2)
            .map(s => ({
              OBJECT_NAME: s.OBJECT_NAME || 'UNKNOWN',
              TLE_LINE1: s.TLE_LINE1,
              TLE_LINE2: s.TLE_LINE2,
              CONSTELLATION: detectConstellation(s.OBJECT_NAME || ''),
            }))
          return res.status(200).json(formatted)
        }
      }
    } catch (e) {
      console.log('space-track failed, using fallback:', e.message)
    }
  
    // Fallback: ivanstanojevic TLE API (still ~1500 satellites)
    try {
      const fetchGroup = async (search, pages = 3) => {
        const all = []
        for (let p = 1; p <= pages; p++) {
          const r = await fetch(`https://tle.ivanstanojevic.me/api/tle/?search=${search}&page=${p}&page-size=500`, {
            headers: { 'User-Agent': 'satellite-tracker' }
          })
          const json = await r.json()
          if (json.member) all.push(...json.member)
        }
        return all
      }
  
      const [starlink, gps, glonass, oneweb, iridium, iss] = await Promise.all([
        fetchGroup('STARLINK', 4),
        fetchGroup('GPS', 1),
        fetchGroup('GLONASS', 1),
        fetchGroup('ONEWEB', 2),
        fetchGroup('IRIDIUM', 1),
        fetchGroup('ISS', 1),
      ])
  
      const all = [...starlink, ...gps, ...glonass, ...oneweb, ...iridium, ...iss]
      const seen = new Set()
      const unique = all.filter(s => {
        if (seen.has(s.satelliteId)) return false
        seen.add(s.satelliteId)
        return true
      })
  
      const data = unique
        .filter(s => s.line1 && s.line2)
        .map(s => ({
          OBJECT_NAME: s.name,
          TLE_LINE1: s.line1,
          TLE_LINE2: s.line2,
          CONSTELLATION: detectConstellation(s.name),
        }))
  
      return res.status(200).json(data)
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }
  
  function detectConstellation(name) {
    const n = name.toUpperCase()
    if (n.includes('STARLINK')) return 'Starlink'
    if (n.includes('GPS') || n.includes('NAVSTAR')) return 'GPS'
    if (n.includes('GLONASS')) return 'GLONASS'
    if (n.includes('ONEWEB')) return 'OneWeb'
    if (n.includes('IRIDIUM')) return 'Iridium'
    if (n.includes('ISS') || n.includes('ZARYA')) return 'ISS'
    if (n.includes('GALILEO')) return 'Galileo'
    if (n.includes('BEIDOU')) return 'BeiDou'
    return 'Other'
  }