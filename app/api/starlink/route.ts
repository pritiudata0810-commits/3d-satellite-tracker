import { NextResponse } from 'next/server'
import { getTleBundle } from '@/app/lib/tleFetcher'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET() {
  try {
    const { data, meta } = await getTleBundle()
    const filtered = data.filter((t) => t.OBJECT_NAME.toUpperCase().includes('STARLINK'))
    return NextResponse.json(filtered, {
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
