export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Content-Type', 'application/json')
    
    const group = req.query.group || 'starlink'
  
    try {
      const response = await fetch(
        `https://celestrak.org/gp.php?GROUP=${group}&FORMAT=json`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 satellite-tracker'
          }
        }
      )
  
      if (!response.ok) {
        throw new Error(`CelesTrak returned ${response.status}`)
      }
  
      const text = await response.text()
      const data = JSON.parse(text)
      res.status(200).json(data)
  
    } catch (error) {
      res.status(500).json({ 
        error: error.message,
        group: group 
      })
    }
  }