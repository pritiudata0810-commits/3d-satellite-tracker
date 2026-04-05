export const TLE_CACHE_TTL_MS = 45 * 60 * 1000

export const COUNTRIES_GEO_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v4.0.0/geojson/ne_50m_admin_0_countries.geojson'

export const EARTH_NIGHT =
  'https://unpkg.com/three-globe/example/img/earth-night.jpg'
export const EARTH_DAY =
  'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
export const EARTH_BUMP =
  'https://unpkg.com/three-globe/example/img/earth-topology.png'
export const STARFIELD =
  'https://unpkg.com/three-globe/example/img/night-sky.png'

export const GP_URLS = [
  'https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/epoch/%3Enow-10/limit/10000/orderby/norad_cat_id%20asc/format/tle',
  'https://www.space-track.org/basicspacedata/query/class/gp/decay_date/null-val/epoch/%3Enow-10/limit/10000/format/tle',
] as const
