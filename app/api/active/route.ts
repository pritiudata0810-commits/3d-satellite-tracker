import { NextResponse } from 'next/server'
import { getTleBundle } from '@/app/lib/tleFetcher'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Same as full catalog — all returned GP elements are active on-orbit per query filter. */
export async function GET() {
  try {
    const { data, meta } = await getTleBundle()
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
        'X-TLE-Source': meta.source,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'TLE fetch error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
