import type { TleRecord } from './types'
import { meanMotionFromSatrec } from './satelliteUtils'

export type MenuFilter =
  | null
  | { category: 'preset'; id: string }
  | { category: 'constellation'; name: string }

function upperName(t: TleRecord): string {
  return t.OBJECT_NAME.toUpperCase()
}

function isDebris(t: TleRecord): boolean {
  const u = upperName(t)
  return (
    u.includes(' DEB') ||
    u.includes('DEBRIS') ||
    u.includes(' R/B') ||
    u.includes('ROCKET BODY') ||
    u.includes(' AKM') ||
    u.includes('COUCH') ||
    u.includes('OBJECT A') ||
    u.includes('OBJECT B')
  )
}

function hasAny(t: TleRecord, keys: string[]): boolean {
  const u = upperName(t)
  return keys.some((k) => u.includes(k))
}

/** Filter catalog by top-nav / menu selection. */
export function filterTlesByMenu(tles: TleRecord[], filter: MenuFilter): TleRecord[] {
  if (!filter) return tles

  if (filter.category === 'constellation') {
    const q = filter.name.toUpperCase()
    return tles.filter((t) => upperName(t).includes(q))
  }

  const id = filter.id

  if (id === 'all') return tles
  if (id === 'all_functional') return tles.filter((t) => !isDebris(t))

  if (id === 'debris') return tles.filter(isDebris)

  if (id === 'internet')
    return tles.filter((t) => hasAny(t, ['STARLINK', 'KUIPER', 'ONEWEB']))

  if (id === 'communications')
    return tles.filter((t) =>
      hasAny(t, [
        'STARLINK',
        'ONEWEB',
        'IRIDIUM',
        'GLOBALSTAR',
        'ORBCOMM',
        'VIASAT',
        'INTELSAT',
        'SES-',
        'O3B',
        'TELESAT',
        'AST',
        'LYNX',
        'COMMUNICATION',
      ])
    )

  if (id === 'positioning')
    return tles.filter((t) => hasAny(t, ['GPS', 'NAVSTAR', 'GLONASS', 'GALILEO', 'BEIDOU', 'BEI DOU']))

  if (id === 'earth_imaging')
    return tles.filter((t) =>
      hasAny(t, ['WORLDVIEW', 'LANDSAT', 'SENTINEL', 'PLANET', 'MAXAR', 'PLEIADES', 'SPOT'])
    )

  if (id === 'weather')
    return tles.filter((t) => hasAny(t, ['GOES', 'METOP', 'NOAA', 'METEOR', 'FY-', 'HIMAWARI']))

  if (id === 'science')
    return tles.filter((t) => hasAny(t, ['ISS', 'ZARYA', 'HST ', 'HUBBLE', 'JWST']))

  if (id === 'iot') return tles.filter((t) => hasAny(t, ['ORBCOMM', 'IOT', 'SIGFOX']))

  if (id === 'geostationary')
    return tles.filter((t) => {
      const mm = meanMotionFromSatrec(t)
      return mm > 0 && mm < 1.05
    })

  if (id === 'geosynchronous')
    return tles.filter((t) => {
      const mm = meanMotionFromSatrec(t)
      return mm >= 0.85 && mm < 1.25
    })

  if (id === 'starlink') return tles.filter((t) => upperName(t).includes('STARLINK'))
  if (id === 'oneweb') return tles.filter((t) => upperName(t).includes('ONEWEB'))
  if (id === 'gps') return tles.filter((t) => upperName(t).includes('GPS') || upperName(t).includes('NAVSTAR'))
  if (id === 'glonass') return tles.filter((t) => upperName(t).includes('GLONASS'))

  return tles
}
