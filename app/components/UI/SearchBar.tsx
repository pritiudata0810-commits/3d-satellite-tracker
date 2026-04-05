'use client'

import { useMemo, useState } from 'react'
import type { TleRecord } from '@/app/lib/types'
import { noradFromLine1 } from '@/app/lib/tleParser'

export function SearchBar({
  open,
  onClose,
  tles,
  onPick,
}: {
  open: boolean
  onClose: () => void
  tles: TleRecord[]
  onPick: (tle: TleRecord) => void
}) {
  const [q, setQ] = useState('')

  const results = useMemo(() => {
    const s = q.trim().toUpperCase()
    if (!s) return []
    return tles
      .filter((t) => {
        const name = t.OBJECT_NAME.toUpperCase()
        const id = String(noradFromLine1(t.TLE_LINE1))
        return name.includes(s) || id.includes(s)
      })
      .slice(0, 80)
  }, [q, tles])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 pt-24" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-white/15 bg-zinc-950 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or NORAD ID…"
          className="w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2.5 text-sm text-white outline-none ring-0 placeholder:text-zinc-500 focus:border-sky-500/50"
        />
        <div className="mt-2 max-h-72 overflow-y-auto text-sm">
          {results.map((t) => (
            <button
              key={`${t.TLE_LINE1}-${t.TLE_LINE2}`}
              type="button"
              className="flex w-full justify-between border-b border-white/5 px-2 py-2 text-left hover:bg-white/5"
              onClick={() => {
                onPick(t)
                onClose()
                setQ('')
              }}
            >
              <span className="truncate text-zinc-200">{t.OBJECT_NAME}</span>
              <span className="shrink-0 text-zinc-500">{noradFromLine1(t.TLE_LINE1)}</span>
            </button>
          ))}
          {q && results.length === 0 && <div className="py-6 text-center text-zinc-500">No matches</div>}
        </div>
      </div>
    </div>
  )
}
