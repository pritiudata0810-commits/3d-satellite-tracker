export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
  
    const LOGIN_URL = 'https://www.space-track.org/ajaxauth/login'
    const DATA_URL = 'https://www.space-track.org/basicspacedata/query/class/gp/EPOCH/%3Enow-30/MEAN_MOTION/%3E11.25/ECCENTRICITY/%3C0.25/orderby/NORAD_CAT_ID/format/json'
  
    try {
      // Step 1: Login to space-track.org
      const loginRes = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `identity=${encodeURIComponent(process.env.SPACETRACK_USER)}&password=${encodeURIComponent(process.env.SPACETRACK_PASS)}&query=${encodeURIComponent(DATA_URL)}`,
      })
  
      const rawText = await loginRes.text()
  
      let data
      try {
        data = JSON.parse(rawText)
      } catch {
        return res.status(500).json({ error: 'Login failed or bad response', raw: rawText.slice(0, 200) })
      }
  
      if (!Array.isArray(data)) {
        return res.status(500).json({ error: 'Unexpected response format', sample: JSON.stringify(data).slice(0, 200) })
      }
  
      // Step 2: Format into standard TLE structure
      const formatted = data
        .filter(s => s.TLE_LINE1 && s.TLE_LINE2)
        .map(s => ({
          OBJECT_NAME: s.OBJECT_NAME || s.SATNAME || 'UNKNOWN',
          TLE_LINE1: s.TLE_LINE1,
          TLE_LINE2: s.TLE_LINE2,
        }))
  
      res.status(200).json(formatted)
  
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  }