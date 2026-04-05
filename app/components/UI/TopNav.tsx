'use client'

import { useEffect, useState } from 'react'

const LINKS = [
  { key: 'about', label: 'About', items: ['Mission', 'Data sources', 'Credits'] },
  { key: 'news', label: 'News', items: ['Updates', 'RSS'], dot: true },
  { key: 'constellations', label: 'Constellations', items: ['Starlink', 'OneWeb', 'GPS', 'GLONASS'] },
  { key: 'types', label: 'Types', items: ['Payload', 'Rocket body', 'Debris'] },
  { key: 'functions', label: 'Functions', items: ['Navigation', 'Communications'] },
  { key: 'more', label: 'More', items: ['API', 'Contact'] },
] as const

export function TopNav({ onSearchClick }: { onSearchClick: () => void }) {
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    if (open === null) return
    const close = (e: MouseEvent) => {
      const el = document.querySelector('.nav-dd')
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setOpen(null)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  return (
    <header className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-white/10 bg-gradient-to-b from-black/95 to-black/40 px-4 py-2.5 pr-3">
      <div className="pointer-events-auto font-extrabold tracking-wide text-white">3D Satellite Tracker</div>

      <nav
        className="nav-dd pointer-events-auto flex max-w-2xl flex-1 flex-wrap justify-center gap-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        {LINKS.map((item) => (
          <div key={item.key} className="relative">
            <button
              type="button"
              onClick={() => setOpen(open === item.key ? null : item.key)}
              className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm text-zinc-200 hover:bg-white/10 ${open === item.key ? 'bg-white/10' : ''}`}
            >
              {item.label}
              <span className="text-[9px] opacity-60">▼</span>
              {'dot' in item && item.dot && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
            </button>
            {open === item.key && (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-white/15 bg-zinc-950/98 py-1 shadow-xl">
                {item.items.map((sub) => (
                  <div key={sub} className="cursor-default px-3 py-2 text-sm text-zinc-200 hover:bg-white/5">
                    {sub}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
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
