export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
  
    try {
      const response = await fetch(
        'https://tle.ivanstanojevic.me/api/tle/?search=STARLINK&page-size=100'
      )
      const json = await response.json()
  
      // Convert to same format our app expects
      const data = json.member.map(sat => ({
        OBJECT_NAME: sat.name,
        TLE_LINE1: sat.line1,
        TLE_LINE2: sat.line2
      }))
  
      res.status(200).json(data)
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  }