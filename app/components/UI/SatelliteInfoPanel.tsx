'use client'

import type { SatellitePoint } from '@/app/lib/types'

export function SatelliteInfoPanel({
  selected,
  onRemove,
  onClear,
}: {
  selected: SatellitePoint[]
  onRemove: (norad: number) => void
  onClear: () => void
}) {
  if (selected.length === 0) return null

  return (
    <div className="pointer-events-auto fixed bottom-24 left-4 z-30 max-h-[45vh] w-[300px] overflow-y-auto rounded-xl border border-white/15 bg-black/85 p-3 shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Selected ({selected.length})</span>
        <button type="button" onClick={onClear} className="text-xs text-sky-400 hover:underline">
          Clear all
        </button>
      </div>
      <ul className="space-y-2 text-xs text-zinc-300">
        {selected.map((s) => (
          <li key={s.norad} className="rounded-lg border border-white/10 bg-white/5 p-2">
            <div className="flex justify-between gap-2">
              <span className="font-medium text-white">{s.name}</span>
              <button type="button" className="shrink-0 text-zinc-500 hover:text-white" onClick={() => onRemove(s.norad)} aria-label="Deselect">
                ✕
              </button>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
              <span>NORAD</span>
              <span className="text-right text-zinc-400">{s.norad}</span>
              <span>Alt</span>
              <span className="text-right text-zinc-400">{s.altKm} km</span>
              <span>Inc</span>
              <span className="text-right text-zinc-400">{s.inclination}°</span>
              <span>Lat</span>
              <span className="text-right text-zinc-400">{s.lat.toFixed(2)}°</span>
              <span>Lng</span>
              <span className="text-right text-zinc-400">{s.lng.toFixed(2)}°</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
