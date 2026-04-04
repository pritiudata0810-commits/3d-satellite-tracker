export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    const { group = 'starlink' } = req.query
    const url = `https://celestrak.org/gp.php?GROUP=${group}&FORMAT=json`
    const response = await fetch(url)
    const data = await response.json()
    res.status(200).json(data)
  }