import type { TleRecord } from './types'

export function parseTleResponse(text: string): TleRecord[] {
  const raw = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const out: TleRecord[] = []
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

export function noradFromLine1(line1: string): number {
  const n = parseInt(line1.substring(2, 7).trim(), 10)
  return Number.isFinite(n) ? n : 0
}
