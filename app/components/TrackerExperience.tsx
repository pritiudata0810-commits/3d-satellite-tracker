'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import Globe from './Globe'
import { TopNav } from './UI/TopNav'
import { Sidebar } from './UI/Sidebar'
import { BottomToolbar } from './UI/BottomToolbar'
import { SearchBar } from './UI/SearchBar'
import { SatelliteInfoPanel } from './UI/SatelliteInfoPanel'
import type { GlobeApi } from './types'
import type { SatellitePoint, TelemetryPayload, TleRecord } from '@/app/lib/types'
import type { MenuFilter } from '@/app/lib/satelliteFilters'
import { noradFromLine1 } from '@/app/lib/tleParser'
import * as satellite from 'satellite.js'

const initialUi = {
  bordersOn: true,
  graticulesOn: true,
  starfieldOn: true,
  dayTexture: true,
  orbitTrails: false,   // OFF by default — expensive
  cloudsOn: false,
  terminatorOn: false,  // OFF by default — expensive
  animPaused: false,
}

export default function TrackerExperience() {
  const [telemetry, setTelemetry] = useState<TelemetryPayload | null>(null)
  const [tles, setTles] = useState<TleRecord[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [points, setPoints] = useState<SatellitePoint[]>([])
  const [globeApi, setGlobeApi] = useState<GlobeApi | null>(null)
  const [utcStr, setUtcStr] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [ui, setUi] = useState(initialUi)
  const [vizMode, setVizMode] = useState(0)
  const [menuFilter, setMenuFilter] = useState<MenuFilter>(null)

  // Only update React points state when satellites are selected
  // (avoids re-rendering with 9999 items every 2 seconds)
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  const handlePointsUpdate = useCallback((pts: SatellitePoint[]) => {
    if (selectedRef.current.size > 0) {
      setPoints(pts)
    }
  }, [])

  const selectedPoints = useMemo(
    () => points.filter((p) => selected.has(p.norad)),
    [points, selected]
  )

  const onToggle = useCallback((key: string, v: boolean) => {
    setUi((prev) => ({ ...prev, [key]: v }))
  }, [])

  const onPlayPause = useCallback(() => {
    setUi((prev) => {
      if (prev.animPaused) globeApi?.jumpToNow()
      return { ...prev, animPaused: !prev.animPaused }
    })
  }, [globeApi])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <TopNav
        onSearchClick={() => setSearchOpen(true)}
        onFilterChange={setMenuFilter}
        onVizSlide={setVizMode}
      />

      <Globe
        onReady={setGlobeApi}
        onTelemetry={setTelemetry}
        onTleLoaded={setTles}
        selected={selected}
        onSelectionChange={setSelected}
        onPointsUpdate={handlePointsUpdate}
        ui={ui}
        onUtc={setUtcStr}
        vizMode={vizMode}
        menuFilter={menuFilter}
      />

      <div className="pointer-events-none absolute left-4 top-16 z-30">
        <p className="text-3xl font-extrabold text-white/20">3D Satellite Tracker</p>
        <p className="mt-1 text-sm text-zinc-500">
          {telemetry
            ? `${telemetry.total.toLocaleString()} satellites`
            : tles.length
              ? `${tles.length.toLocaleString()} in catalog…`
              : 'Loading ephemeris…'}
        </p>
      </div>

      <Sidebar
        telemetry={telemetry}
        open={sidebarOpen}
        onToggleOpen={() => setSidebarOpen((o) => !o)}
        slide={vizMode}
        onSlideChange={setVizMode}
      />

      <SatelliteInfoPanel
        selected={selectedPoints}
        onRemove={(norad) => {
          setSelected((s) => {
            const n = new Set(s)
            n.delete(norad)
            return n
          })
        }}
        onClear={() => setSelected(new Set())}
      />

      <BottomToolbar
        api={globeApi}
        utcStr={utcStr}
        bordersOn={ui.bordersOn}
        graticulesOn={ui.graticulesOn}
        starfieldOn={ui.starfieldOn}
        dayTexture={ui.dayTexture}
        orbitTrails={ui.orbitTrails}
        cloudsOn={ui.cloudsOn}
        terminatorOn={ui.terminatorOn}
        onToggle={onToggle}
        onStep={(ms) => globeApi?.stepTime(ms)}
        onPlayPause={onPlayPause}
        onRefreshTle={() => globeApi?.refreshTle()}
        animPaused={ui.animPaused}
      />

      <SearchBar
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        tles={tles}
        onPick={(tle) => {
          const id = noradFromLine1(tle.TLE_LINE1)
          setSelected((s) => {
            const n = new Set(s)
            n.add(id)
            return n
          })
          try {
            const satrec = satellite.twoline2satrec(tle.TLE_LINE1, tle.TLE_LINE2)
            const pv = satellite.propagate(satrec, new Date())
            const pos = pv?.position
            if (pos && typeof pos !== 'boolean') {
              const gmst = satellite.gstime(new Date())
              const geo = satellite.eciToGeodetic(pos, gmst)
              const lat = satellite.degreesLat(geo.latitude)
              const lng = satellite.degreesLong(geo.longitude)
              globeApi?.focusOn(lat, lng, 0.12)
            }
          } catch {
            /* ignore */
          }
        }}
      />
    </div>
  )
}