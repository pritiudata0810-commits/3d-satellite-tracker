import { GP_URLS, TLE_CACHE_TTL_MS } from './constants'
import { createMemoryCache } from './cache'
import { parseTleResponse } from './tleParser'
import type { TleRecord } from './types'

const cache = createMemoryCache<TleRecord[]>()

function joinCookieHeader(res: Response): string {
  const h = res.headers
  const gs = (h as Headers & { getSetCookie?: () => string[] }).getSetCookie
  if (typeof gs === 'function') {
    return gs.call(h).map((c) => c.split(';')[0]).join('; ')
  }
  const single = h.get('set-cookie')
  if (!single) return ''
  return single
    .split(/,(?=\s*[^=]+=)/)
    .map((p) => p.trim().split(';')[0])
    .join('; ')
}

async function fetchSpaceTrack(user: string, pass: string): Promise<TleRecord[]> {
  const loginRes = await fetch('https://www.space-track.org/ajaxauth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ identity: user, password: pass }),
    redirect: 'manual',
  })
  const cookie = joinCookieHeader(loginRes)
  if (!cookie || loginRes.status >= 400) {
    throw new Error('Space-Track login failed')
  }

  let dataRes: Response | undefined
  let lastErr = ''
  for (const url of GP_URLS) {
    dataRes = await fetch(url, { headers: { Cookie: cookie }, redirect: 'manual' })
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

  if (!dataRes?.ok) {
    throw new Error(`Space-Track GP failed: ${dataRes?.status ?? 'n/a'} ${lastErr.slice(0, 120)}`)
  }

  const text = await dataRes.text()
  return parseTleResponse(text)
}

async function fetchFallback(): Promise<TleRecord[]> {
  const fetchGroup = async (search: string, page: number, size: number) => {
    try {
      const r = await fetch(
        `https://tle.ivanstanojevic.me/api/tle/?search=${search}&page=${page}&page-size=${size}`,
        { headers: { 'User-Agent': '3d-satellite-tracker' } }
      )
      const json = (await r.json()) as { member?: { name: string; line1: string; line2: string; satelliteId: number }[] }
      return json.member ?? []
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
  const seen = new Set<number>()
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

export type TleFetchMeta = { source: string }

export async function getTleBundle(): Promise<{ data: TleRecord[]; meta: TleFetchMeta }> {
  const hit = cache.get(TLE_CACHE_TTL_MS)
  if (hit) return { data: hit, meta: { source: 'memory-cache' } }

  const user =
    process.env.SPACETRACK_USER ||
    process.env.SPACETRACK_USERNAME ||
    process.env.SPACETRACK_IDENTITY ||
    process.env.SPACE_TRACK_USERNAME
  const pass = process.env.SPACETRACK_PASS || process.env.SPACETRACK_PASSWORD || process.env.SPACE_TRACK_PASSWORD

  let data: TleRecord[] = []
  let source = 'fallback'

  if (user && pass) {
    try {
      data = await fetchSpaceTrack(user, pass)
      source = 'space-track'
    } catch {
      data = await fetchFallback()
      source = 'fallback-after-error'
    }
  } else {
    data = await fetchFallback()
  }

  cache.set(data)
  return { data, meta: { source } }
}

export function filterByNameSubstring(tles: TleRecord[], q: string): TleRecord[] {
  const u = q.toUpperCase()
  return tles.filter((t) => t.OBJECT_NAME.toUpperCase().includes(u))
}
