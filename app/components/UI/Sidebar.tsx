'use client'

import type { TelemetryPayload } from '@/app/lib/types'
import { pct } from '@/app/lib/satelliteUtils'

const SLIDE_COUNT = 7

const stripeHandle =
  'repeating-linear-gradient(135deg,#3f3f46 0,#3f3f46 4px,#09090b 4px,#09090b 8px)'

function Sq({ c }: { c: string }) {
  return <span className="inline-block h-3 w-3 shrink-0 rounded-sm shadow-[0_0_6px_currentColor]" style={{ background: c, color: c }} />
}

export function Sidebar({
  telemetry,
  open,
  onToggleOpen,
  slide,
  onSlideChange,
}: {
  telemetry: TelemetryPayload | null
  open: boolean
  onToggleOpen: () => void
  slide: number
  onSlideChange: (slide: number) => void
}) {
  const t = telemetry
  const total = t?.total ?? 0

  const prev = () => onSlideChange((slide - 1 + SLIDE_COUNT) % SLIDE_COUNT)
  const next = () => onSlideChange((slide + 1) % SLIDE_COUNT)

  const incLegend = [
    { c: '#e63946', label: 'Equatorial', r: '0°–30°' },
    { c: '#ff8c00', label: 'Low', r: '30°–60°' },
    { c: '#ffd700', label: 'Medium', r: '60°–90°' },
    { c: '#2ecc40', label: 'High', r: '90°–120°' },
    { c: '#4488ff', label: 'Retrograde', r: '120°–180°' },
  ]

  const constellLegend = [
    { c: '#4488ff', label: 'Starlink' },
    { c: '#ff8c00', label: 'Kuiper' },
    { c: '#7cfc7c', label: 'Oneweb' },
    { c: '#ffd700', label: 'Iridium' },
    { c: '#e63946', label: 'Gps' },
    { c: '#ff44ff', label: 'Globalstar' },
    { c: '#44ffff', label: 'Galileo' },
    { c: '#fa8072', label: 'Glonass' },
    { c: '#daa520', label: 'Beidou' },
    { c: '#a855f7', label: 'Qianfan' },
    { c: '#9ca3af', label: 'Other' },
  ]

  const altLegend = [
    { c: '#e63946', label: 'Very Low Earth Orbit (VLEO)', r: '0–400 km' },
    { c: '#ff8c00', label: 'Low Earth Orbit (LEO)', r: '400–1000 km' },
    { c: '#ffd700', label: 'Medium Earth Orbit', r: '1000–2000 km' },
    { c: '#2ecc40', label: 'High Earth Orbit', r: '2000–35786 km' },
    { c: '#4488ff', label: 'Geostationary (GEO)', r: '35786–35888 km' },
    { c: '#8844ff', label: 'Beyond GEO', r: '35888–100000 km' },
  ]

  return (
    <div
      className="pointer-events-auto fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-row-reverse items-stretch overflow-hidden transition-[width] duration-300"
      style={{ width: open ? 318 : 26 }}
    >
      <button
        type="button"
        aria-label={open ? 'Collapse panel' : 'Expand panel'}
        onClick={onToggleOpen}
        className="flex w-[26px] shrink-0 flex-col items-center justify-center border-y border-l border-white/15 bg-zinc-950/95 text-zinc-300"
        style={{ backgroundImage: stripeHandle }}
      >
        <span className="text-sm font-bold drop-shadow-md">{open ? '›' : '‹'}</span>
      </button>

      <div className="w-[292px] shrink-0 rounded-l-xl border border-r-0 border-white/15 bg-black/80 px-4 py-3 shadow-[-8px_0_32px_rgba(0,0,0,0.5)] backdrop-blur-md">
        {slide === 0 && (
          <>
            <h2 className="border-b border-white/10 pb-2 text-center text-base font-bold text-white">Inclination</h2>
            <ul className="mt-3 space-y-2">
              {incLegend.map((x) => (
                <li key={x.label} className="flex items-start gap-2 text-sm text-zinc-100">
                  <Sq c={x.c} />
                  <span>
                    {x.label} <span className="text-xs text-zinc-500">{x.r}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-xs font-semibold text-zinc-400">Distribution ({total.toLocaleString()} satellites)</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between text-zinc-200">
                  <span>Low</span>
                  <span>
                    {t?.inclination.low.toLocaleString() ?? 0} ({pct(t?.inclination.low ?? 0, total)}%)
                  </span>
                </div>
                <div className="flex justify-between text-zinc-200">
                  <span>Medium</span>
                  <span>
                    {t?.inclination.medium.toLocaleString() ?? 0} ({pct(t?.inclination.medium ?? 0, total)}%)
                  </span>
                </div>
                <div className="flex justify-between text-zinc-200">
                  <span>High</span>
                  <span>
                    {t?.inclination.high.toLocaleString() ?? 0} ({pct(t?.inclination.high ?? 0, total)}%)
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {slide === 1 && (
          <>
            <h2 className="border-b border-white/10 pb-2 text-center text-base font-bold text-white">Constellation</h2>
            <ul className="mt-3 max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
              {constellLegend.map((x) => (
                <li key={x.label} className="flex items-center gap-2 text-sm text-zinc-100">
                  <Sq c={x.c} />
                  {x.label}
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-xs font-semibold text-zinc-300">Distribution ({total.toLocaleString()} satellites)</p>
              <div className="mt-2 max-h-24 space-y-1 overflow-y-auto text-sm">
                {t &&
                  Object.entries(t.constellation)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 8)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between text-zinc-200">
                        <span>{k}</span>
                        <span>
                          {v.toLocaleString()} ({pct(v, total)}%)
                        </span>
                      </div>
                    ))}
              </div>
            </div>
          </>
        )}

        {slide === 2 && (
          <>
            <h2 className="border-b border-white/10 pb-2 text-center text-base font-bold text-white">Orbital Altitude</h2>
            <ul className="mt-3 space-y-2">
              {altLegend.map((x) => (
                <li key={x.label} className="flex items-start gap-2 text-sm text-zinc-100">
                  <Sq c={x.c} />
                  <span>
                    <span className="block">{x.label}</span>
                    <span className="text-xs text-zinc-500">{x.r}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-xs font-semibold text-zinc-300">
                Distribution ({total}/{total} satellites)
              </p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between text-zinc-200">
                  <span>Very Low Earth Orbit</span>
                  <span>
                    {t?.altitude.vleo.toLocaleString() ?? 0} ({pct(t?.altitude.vleo ?? 0, total)}%)
                  </span>
                </div>
                <div className="flex justify-between text-zinc-200">
                  <span>Low Earth Orbit</span>
                  <span>
                    {(t ? t.altitude.leo + t.altitude.vleo : 0).toLocaleString()} (
                    {pct((t ? t.altitude.leo + t.altitude.vleo : 0), total)}%)
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {slide === 3 && (
          <>
            <h2 className="border-b border-white/10 pb-2 text-center text-base font-bold text-white">Hardware Type</h2>
            <ul className="mt-3 space-y-2">
              {Object.keys(t?.hardware ?? {}).length === 0 && <li className="text-sm text-zinc-500">Loading…</li>}
              {t &&
                Object.entries(t.hardware)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([k], i) => {
                    const colors = ['#2ecc40', '#4488ff', '#e63946', '#ffd700', '#ff8c00']
                    return (
                      <li key={k} className="flex items-center gap-2 text-sm text-zinc-100">
                        <Sq c={colors[i % colors.length]} />
                        {k} ({t.hardware[k]?.toLocaleString()})
                      </li>
                    )
                  })}
            </ul>
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-xs font-semibold text-zinc-300">Distribution ({total.toLocaleString()} satellites)</p>
              <div className="mt-2 max-h-28 space-y-1 overflow-y-auto text-sm">
                {t &&
                  Object.entries(t.hardware)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between text-zinc-200">
                        <span className="truncate pr-2">{k}</span>
                        <span>
                          {v.toLocaleString()} ({pct(v, total)}%)
                        </span>
                      </div>
                    ))}
              </div>
            </div>
          </>
        )}

        {slide === 4 && (
          <>
            <h2 className="border-b border-white/10 pb-2 text-center text-base font-bold text-white">Re-entry Risk</h2>
            <ul className="mt-3 space-y-2 text-sm text-zinc-100">
              <li className="flex items-center gap-2">
                <Sq c="#e63946" />
                Critical (&lt;180km)
              </li>
              <li className="flex items-center gap-2">
                <Sq c="#ff4500" />
                High Risk (180–200km)
              </li>
              <li className="flex items-center gap-2">
                <Sq c="#ff8c00" />
                Medium Risk (200–220km)
              </li>
              <li className="flex items-center gap-2">
                <Sq c="#52525b" />
                Normal
              </li>
            </ul>
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-xs font-semibold text-zinc-300">
                Distribution ({(t?.reentry.normal ?? 0) + (t?.reentry.critical ?? 0)}/{total} satellites)
              </p>
              <div className="mt-2 space-y-1 text-sm">
                {(['critical', 'high', 'medium', 'normal', 'nodata'] as const).map((k) => {
                  const n = t ? t.reentry[k] : 0
                  return (
                    <div key={k} className="flex justify-between capitalize text-zinc-200">
                      <span>{k === 'nodata' ? 'No Altitude Data' : k}</span>
                      <span>
                        {n.toLocaleString()} ({pct(n, total)}%)
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {slide === 5 && (
          <>
            <h2 className="border-b border-white/10 pb-2 text-center text-base font-bold text-white">Starlink FCC</h2>
            <ul className="mt-3 max-h-[240px] space-y-1 overflow-y-auto text-sm text-zinc-100">
              {Array.from({ length: 15 }, (_, i) => {
                const colors = ['#4488ff', '#ff8c00', '#a855f7', '#22c55e', '#ec4899', '#f87171', '#22d3ee', '#eab308', '#86efac', '#ea580c', '#93c5fd', '#fdba74', '#ca8a04', '#14b8a6', '#fff']
                return (
                  <li key={i} className="flex items-center gap-2">
                    <Sq c={colors[i] ?? '#fff'} />
                    Group {i + 1}
                  </li>
                )
              })}
              <li className="flex items-center gap-2">
                <Sq c="#ffffff" />
                No Match
              </li>
            </ul>
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-xs text-zinc-400">Distribution ({total.toLocaleString()} satellites)</p>
              <p className="mt-1 text-sm text-zinc-200">
                Starlink{' '}
                <span className="float-right">
                  {(t?.constellation.Starlink ?? 0).toLocaleString()} (
                  {pct(t?.constellation.Starlink ?? 0, total)}%)
                </span>
              </p>
            </div>
          </>
        )}

        {slide === 6 && (
          <>
            <h2 className="border-b border-white/10 pb-2 text-center text-base font-bold text-white">Orbit</h2>
            <ul className="mt-3 max-h-[220px] space-y-1 overflow-y-auto text-xs text-zinc-100">
              {[
                ['#ec4899', 'Molniya'],
                ['#ff8c00', 'Semi-Sync'],
                ['#22d3ee', 'OneWeb'],
                ['#ffd700', 'GNSS'],
                ['#ca8a04', 'Sun-Sync'],
                ['#e63946', 'GEO'],
                ['#a855f7', 'GSO'],
                ['#4ade80', 'HEO Elliptical'],
                ['#86efac', 'HEO'],
                ['#93c5fd', 'Polar'],
                ['#c026d3', 'Retrograde'],
                ['#71717a', 'Elliptical'],
                ['#bbf7d0', 'Circular'],
                ['#06b6d4', 'MEO'],
                ['#3b82f6', 'LEO'],
                ['#fff', 'Unknown'],
              ].map(([c, label]) => (
                <li key={label} className="flex items-center gap-2">
                  <Sq c={c as string} />
                  {label}
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-xs font-semibold text-zinc-300">
                Distribution ({total} visible / {total} total)
              </p>
              <div className="mt-2 max-h-24 space-y-1 overflow-y-auto text-sm">
                {t &&
                  ['Semi-Sync', 'Sun-Sync', 'Retrograde', 'Circular', 'LEO']
                    .filter((k) => (t.orbitClass[k] ?? 0) > 0)
                    .map((k) => (
                      <div key={k} className="flex justify-between text-zinc-200">
                        <span>{k}</span>
                        <span>{(t.orbitClass[k] ?? 0).toLocaleString()}</span>
                      </div>
                    ))}
              </div>
            </div>
          </>
        )}

        <div className="mt-4 flex justify-center gap-3 border-t border-white/10 pt-3">
          <button type="button" onClick={prev} className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-900/80 text-white shadow hover:bg-sky-800">
            &lt;
          </button>
          <button type="button" onClick={() => onSlideChange(0)} className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-900/80 text-lg text-white shadow hover:bg-sky-800">
            ≡
          </button>
          <button type="button" onClick={next} className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-900/80 text-white shadow hover:bg-sky-800">
            &gt;
          </button>
        </div>
      </div>
    </div>
  )
}
