export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    const group = req.query.group || 'starlink'
    
    const response = await fetch(
      `https://celestrak.org/gp.php?GROUP=${group}&FORMAT=json`
    )
    const data = await response.json()
    res.status(200).json(data)
  }