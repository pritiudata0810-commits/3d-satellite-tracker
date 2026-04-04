/**
 * Fetches live GP (TLE) data. Prefer Space-Track (hourly limit — cache client-side).
 * Vercel env: SPACETRACK_USERNAME + SPACETRACK_PASSWORD (or SPACE_TRACK_*).
 */

const GP_URLS = [
  'https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/epoch/%3Enow-10/limit/10000/orderby/norad_cat_id%20asc/format/tle',
  'https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/epoch/%3Enow-10/limit/10000/format/tle',
]

function parseTleResponse(text) {
  const raw = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const out = []
  let i = 0
  while (i < raw.length) {
    const a = raw[i]
    const b = raw[i + 1]
    const c = raw[i + 2]
    if (a.startsWith('1 ') && b?.startsWith('2 ')) {
      out.push({ OBJECT_NAME: 'UNKNOWN', TLE_LINE1: a, TLE_LINE2: b })
      i += 2
    } else if (!a.startsWith('1 ') && b?.startsWith('1 ') && c?.startsWith('2 ')) {
      out.push({
        OBJECT_NAME: (a.replace(/^0+\s*/, '').trim() || 'UNKNOWN').slice(0, 24),
        TLE_LINE1: b,
        TLE_LINE2: c,
      })
      i += 3
    } else {
      i += 1
    }
  }
  return out
}

function joinCookieHeader(res) {
  const h = res.headers
  if (typeof h.getSetCookie === 'function') {
    const parts = h.getSetCookie()
    return parts.map((c) => c.split(';')[0]).join('; ')
  }
  const single = h.get('set-cookie')
  if (!single) return ''
  return single
    .split(/,(?=\s*[^=]+=)/)
    .map((p) => p.trim().split(';')[0])
    .join('; ')
}

async function fetchSpaceTrackTles(user, pass) {
  const loginRes = await fetch('https://www.space-track.org/ajaxauth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ identity: user, password: pass }),
    redirect: 'manual',
  })

  const cookie = joinCookieHeader(loginRes)
  if (!cookie || loginRes.status >= 400) {
    throw new Error('Space-Track login failed — check SPACETRACK_USERNAME / SPACETRACK_PASSWORD')
  }

  let dataRes
  let lastErr = ''
  for (const url of GP_URLS) {
    dataRes = await fetch(url, {
      headers: { Cookie: cookie },
      redirect: 'manual',
    })
    if (dataRes.ok) break
    lastErr = await dataRes.text().catch(() => '')
  }

  try {
    await fetch('https://www.space-track.org/ajaxauth/logout', {
      headers: { Cookie: cookie },
    })
  } catch {
    /* ignore */
  }

  if (!dataRes || !dataRes.ok) {
    const st = dataRes?.status ?? 'no response'
    throw new Error(`Space-Track GP query failed: ${st} ${lastErr.slice(0, 200)}`)
  }

  const text = await dataRes.text()
  return parseTleResponse(text)
}

function normalizeRecord(rec) {
  const line1 = rec.TLE_LINE1 ?? rec.tle_line1
  const line2 = rec.TLE_LINE2 ?? rec.tle_line2
  const name = rec.OBJECT_NAME ?? rec.object_name ?? 'UNKNOWN'
  if (!line1 || !line2) return null
  return { OBJECT_NAME: String(name).trim(), TLE_LINE1: line1, TLE_LINE2: line2 }
}

async function fetchFallbackTles() {
  const fetchGroup = async (search, page = 1, size = 500) => {
    try {
      const r = await fetch(
        `https://tle.ivanstanojevic.me/api/tle/?search=${search}&page=${page}&page-size=${size}`,
        { headers: { 'User-Agent': '3d-satellite-tracker' } }
      )
      const json = await r.json()
      return json.member || []
    } catch {
      return []
    }
  }

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
  return all
    .filter((s) => {
      if (seen.has(s.satelliteId)) return false
      seen.add(s.satelliteId)
      return true
    })
    .map((s) => ({
      OBJECT_NAME: s.name,
      TLE_LINE1: s.line1,
      TLE_LINE2: s.line2,
    }))
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  const user =
    process.env.SPACETRACK_USERNAME ||
    process.env.SPACE_TRACK_USERNAME ||
    process.env.SPACETRACK_IDENTITY
  const pass = process.env.SPACETRACK_PASSWORD || process.env.SPACE_TRACK_PASSWORD

  try {
    let raw = []
    let source = 'fallback'

    if (user && pass) {
      try {
        raw = await fetchSpaceTrackTles(user, pass)
        source = 'space-track'
      } catch (e) {
        console.error('Space-Track error:', e.message)
        raw = await fetchFallbackTles()
        source = 'fallback-after-error'
      }
    } else {
      raw = await fetchFallbackTles()
    }

    const data = []
    for (const rec of raw) {
      const n = normalizeRecord(rec)
      if (n) data.push(n)
    }

    res.setHeader('X-Satellite-Source', source)
    res.status(200).json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}
