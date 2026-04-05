'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type { MenuFilter } from '@/app/lib/satelliteFilters'

type Props = {
  onSearchClick: () => void
  onFilterChange: (f: MenuFilter) => void
  /** Jump right sidebar to a slide (e.g. Re-entry risk). */
  onVizSlide?: (slide: number) => void
}

function Row({
  children,
  onPick,
  close,
}: {
  children: ReactNode
  onPick: () => void
  close: () => void
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onPick()
        close()
      }}
      className="block w-full px-3 py-2 text-left text-sm text-zinc-100 hover:bg-white/10"
    >
      {children}
    </button>
  )
}

function SubRow({ label, onPick, close }: { label: string; onPick: () => void; close: () => void }) {
  return <Row onPick={onPick} close={close}>{label}</Row>
}

export function TopNav({ onSearchClick, onFilterChange, onVizSlide }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const close = () => setOpen(null)

  useEffect(() => {
    if (open === null) return
    const h = (e: MouseEvent) => {
      const el = document.querySelector('.nav-dd')
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setOpen(null)
    }
    window.addEventListener('click', h)
    return () => window.removeEventListener('click', h)
  }, [open])

  const preset = (id: string): MenuFilter => ({ category: 'preset', id })
  const constellation = (name: string): MenuFilter => ({ category: 'constellation', name })

  return (
    <header className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-white/10 bg-gradient-to-b from-black/95 to-black/40 px-4 py-2.5 pr-3">
      <div className="pointer-events-auto font-extrabold tracking-wide text-white">3D Satellite Tracker</div>

      <nav
        className="nav-dd pointer-events-auto flex max-w-3xl flex-1 flex-wrap justify-center gap-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === 'about' ? null : 'about')}
            className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 ${open === 'about' ? 'bg-white/10' : ''}`}
          >
            About<span className="text-[9px] opacity-60">▼</span>
          </button>
          {open === 'about' && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-white/15 bg-zinc-950/98 py-1 shadow-xl">
              <SubRow label="Mission" onPick={() => {}} close={close} />
              <SubRow label="Data sources" onPick={() => {}} close={close} />
              <SubRow label="Credits" onPick={() => {}} close={close} />
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === 'news' ? null : 'news')}
            className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 ${open === 'news' ? 'bg-white/10' : ''}`}
          >
            News<span className="text-[9px] opacity-60">▼</span>
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          </button>
          {open === 'news' && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-white/15 bg-zinc-950/98 py-1 shadow-xl">
              <SubRow label="Updates" onPick={() => {}} close={close} />
              <SubRow label="RSS" onPick={() => {}} close={close} />
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === 'constellations' ? null : 'constellations')}
            className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm text-sky-400 hover:bg-white/10 ${open === 'constellations' ? 'bg-white/10' : ''}`}
          >
            Constellations<span className="text-[9px] opacity-60">▼</span>
          </button>
          {open === 'constellations' && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-white/15 bg-[#0a0f1a]/98 py-1 shadow-xl">
              <Row onPick={onSearchClick} close={close}>
                Finder
              </Row>
              <div className="group relative">
                <div className="flex cursor-default items-center justify-between px-3 py-2 text-sm text-zinc-100 hover:bg-white/5">
                  Internet <span className="text-zinc-500">›</span>
                </div>
                <div className="absolute left-full top-0 z-50 ml-0.5 hidden min-w-[180px] rounded-lg border border-white/15 bg-[#0a0f1a]/98 py-1 shadow-xl group-hover:block">
                  <SubRow label="All Internet" onPick={() => onFilterChange(preset('internet'))} close={close} />
                  <SubRow label="Starlink" onPick={() => onFilterChange(constellation('STARLINK'))} close={close} />
                  <SubRow label="Kuiper" onPick={() => onFilterChange(constellation('KUIPER'))} close={close} />
                  <SubRow label="OneWeb" onPick={() => onFilterChange(constellation('ONEWEB'))} close={close} />
                </div>
              </div>
              <SubRow label="Communications" onPick={() => onFilterChange(preset('communications'))} close={close} />
              <SubRow label="Positioning" onPick={() => onFilterChange(preset('positioning'))} close={close} />
              <SubRow label="Earth Imaging" onPick={() => onFilterChange(preset('earth_imaging'))} close={close} />
              <SubRow label="Weather" onPick={() => onFilterChange(preset('weather'))} close={close} />
              <SubRow label="Science" onPick={() => onFilterChange(preset('science'))} close={close} />
              <SubRow label="IoT" onPick={() => onFilterChange(preset('iot'))} close={close} />
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === 'types' ? null : 'types')}
            className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm text-sky-400 hover:bg-white/10 ${open === 'types' ? 'bg-white/10' : ''}`}
          >
            Types<span className="text-[9px] opacity-60">▼</span>
          </button>
          {open === 'types' && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-white/15 bg-[#0a0f1a]/98 py-1 shadow-xl">
              <SubRow label="Internet" onPick={() => onFilterChange(preset('internet'))} close={close} />
              <SubRow label="Communications" onPick={() => onFilterChange(preset('communications'))} close={close} />
              <SubRow label="Global Positioning" onPick={() => onFilterChange(preset('positioning'))} close={close} />
              <SubRow label="Earth Imaging" onPick={() => onFilterChange(preset('earth_imaging'))} close={close} />
              <SubRow label="geostationary" onPick={() => onFilterChange(preset('geostationary'))} close={close} />
              <SubRow label="geosynchronous" onPick={() => onFilterChange(preset('geosynchronous'))} close={close} />
              <SubRow label="All Functional" onPick={() => onFilterChange(preset('all_functional'))} close={close} />
              <SubRow label="Debris" onPick={() => onFilterChange(preset('debris'))} close={close} />
              <SubRow label="All" onPick={() => onFilterChange(null)} close={close} />
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === 'functions' ? null : 'functions')}
            className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 ${open === 'functions' ? 'bg-white/10' : ''}`}
          >
            Functions<span className="text-[9px] opacity-60">▼</span>
          </button>
          {open === 'functions' && (
            <div className="absolute left-0 top-full z-50 mt-1 min-w-[240px] rounded-lg border border-white/15 bg-[#0a0f1a]/98 py-1 shadow-xl">
              <div className="group relative">
                <div className="flex cursor-default items-center justify-between px-3 py-2 text-sm text-zinc-100 hover:bg-white/5">
                  Constellation Data <span className="text-zinc-500">›</span>
                </div>
                <div className="absolute left-full top-0 z-50 ml-0.5 hidden min-w-[160px] rounded-lg border border-white/15 bg-[#0a0f1a]/98 py-1 shadow-xl group-hover:block">
                  <SubRow label="Browse…" onPick={() => {}} close={close} />
                </div>
              </div>
              <div className="group relative">
                <div className="flex cursor-default items-center justify-between px-3 py-2 text-sm text-zinc-100 hover:bg-white/5">
                  Visualizer <span className="text-zinc-500">›</span>
                </div>
                <div className="absolute left-full top-0 z-50 ml-0.5 hidden min-w-[140px] rounded-lg border border-white/15 bg-[#0a0f1a]/98 py-1 shadow-xl group-hover:block">
                  <SubRow label="Open…" onPick={() => {}} close={close} />
                </div>
              </div>
              <div className="group relative">
                <div className="flex cursor-default items-center justify-between px-3 py-2 text-sm text-zinc-100 hover:bg-white/5">
                  Bookmarks <span className="text-zinc-500">›</span>
                </div>
                <div className="absolute left-full top-0 z-50 ml-0.5 hidden min-w-[140px] rounded-lg border border-white/15 bg-[#0a0f1a]/98 py-1 shadow-xl group-hover:block">
                  <SubRow label="Saved…" onPick={() => {}} close={close} />
                </div>
              </div>
              <div className="group relative">
                <div className="flex cursor-default items-center justify-between px-3 py-2 text-sm text-zinc-100 hover:bg-white/5">
                  Calculators <span className="text-zinc-500">›</span>
                </div>
                <div className="absolute left-full top-0 z-50 ml-0.5 hidden min-w-[140px] rounded-lg border border-white/15 bg-[#0a0f1a]/98 py-1 shadow-xl group-hover:block">
                  <SubRow label="Tools…" onPick={() => {}} close={close} />
                </div>
              </div>
              <SubRow
                label="⚡ Re-Entries"
                onPick={() => onVizSlide?.(4)}
                close={close}
              />
              <SubRow label="🧮 TLE Analysis" onPick={() => {}} close={close} />
              <SubRow label="📷 Photo Simulator" onPick={() => {}} close={close} />
              <SubRow label="⚡ Close Approaches" onPick={() => {}} close={close} />
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(open === 'more' ? null : 'more')}
            className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm text-sky-400 hover:bg-white/10 ${open === 'more' ? 'bg-white/10' : ''}`}
          >
            More<span className="text-[9px] opacity-60">▼</span>
          </button>
          {open === 'more' && (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-white/15 bg-[#0a0f1a]/98 py-1 shadow-xl">
              <SubRow label="Login" onPick={() => {}} close={close} />
              <div className="my-1 border-t border-white/10" />
              <SubRow label="⚙ Settings" onPick={() => {}} close={close} />
              <SubRow label="Feedback" onPick={() => {}} close={close} />
              <SubRow label="Credits" onPick={() => {}} close={close} />
              <SubRow label="Info & Updates" onPick={() => {}} close={close} />
              <SubRow label="Space-track status" onPick={() => {}} close={close} />
            </div>
          )}
        </div>
      </nav>

      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-300 hover:bg-white/10"
        >
          <span className="text-base">↗</span> Share
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-300 hover:bg-white/10"
        >
          <span className="text-base">◎</span> Install
        </button>
        <button
          type="button"
          onClick={onSearchClick}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-lg hover:bg-white/10"
          aria-label="Search"
        >
          🔍
        </button>
      </div>
    </header>
  )
}
