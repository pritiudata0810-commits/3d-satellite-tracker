'use client'

import type { GlobeApi } from '../types'

type Props = {
  api: GlobeApi | null
  utcStr: string
  bordersOn: boolean
  graticulesOn: boolean
  starfieldOn: boolean
  dayTexture: boolean
  orbitTrails: boolean
  cloudsOn: boolean
  terminatorOn: boolean
  onToggle: (key: string, v: boolean) => void
  onStep: (ms: number) => void
  onPlayPause: () => void
  onRefreshTle: () => void
  animPaused: boolean
}

const BTN_BASE = `
  relative flex h-10 w-10 flex-col items-center justify-center
  rounded-lg border border-white/10 bg-white/5 text-white
  hover:bg-white/15 hover:border-white/25 transition-all cursor-pointer
  text-lg
`

const BTN_ON = `bg-blue-500/20 border-blue-400/50 text-blue-300`

function ToolBtn({
  icon, label, on, onClick,
}: { icon: string; label: string; on?: boolean; onClick: () => void }) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={`${BTN_BASE} ${on ? BTN_ON : ''}`}
      >
        {icon}
      </button>
      {/* Tooltip on hover */}
      <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-black/90 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 z-50">
        {label}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/90 border-r border-b border-white/10 rotate-45" />
      </div>
    </div>
  )
}

export function BottomToolbar({
  api,
  utcStr,
  bordersOn,
  graticulesOn,
  starfieldOn,
  dayTexture,
  orbitTrails,
  cloudsOn,
  terminatorOn,
  onToggle,
  onStep,
  onPlayPause,
  onRefreshTle,
  animPaused,
}: Props) {
  return (
    <footer className="pointer-events-none fixed bottom-0 left-0 right-0 z-40">
      <div className="pointer-events-auto flex items-center justify-between bg-black/90 border-t border-white/8 px-4 py-2 backdrop-blur-md">

        {/* Left: icon buttons */}
        <div className="flex items-center gap-1.5">
          <ToolBtn icon="⌂"  label="Home"            onClick={() => api?.resetView()} />
          <ToolBtn icon="↺"  label="Refresh TLE"     onClick={() => { api?.refreshTle(); onRefreshTle() }} />
          <ToolBtn icon="⊞"  label="Lat/Lon Grid"    on={graticulesOn} onClick={() => onToggle('graticules', !graticulesOn)} />
          <ToolBtn icon="🗺" label="Borders"         on={bordersOn}    onClick={() => onToggle('borders', !bordersOn)} />
          <ToolBtn icon="◎"  label="Atmosphere"      on={true}         onClick={() => {}} />
          <ToolBtn icon="✦"  label="Starfield"       on={starfieldOn}  onClick={() => onToggle('starfield', !starfieldOn)} />
          <ToolBtn icon="☀"  label="Day Texture"     on={dayTexture}   onClick={() => onToggle('dayTexture', !dayTexture)} />
          <ToolBtn icon="☁"  label="Clouds"          on={cloudsOn}     onClick={() => onToggle('clouds', !cloudsOn)} />
          <ToolBtn icon="○"  label="Orbit Trails"    on={orbitTrails}  onClick={() => onToggle('orbitTrails', !orbitTrails)} />
          <ToolBtn icon="☾"  label="Terminator"      on={terminatorOn} onClick={() => onToggle('terminator', !terminatorOn)} />
          <ToolBtn icon="3D" label="3D View"          onClick={() => api?.resetView()} />
          <ToolBtn icon="🛰" label="Satellites"       onClick={() => {}} />
        </div>

        {/* Right: UTC + time controls */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-white/70 underline underline-offset-2">
            {utcStr}
          </span>
          <button
            type="button"
            className="rounded border border-white/15 bg-white/8 px-2 py-1 text-xs text-white hover:bg-white/15"
            onClick={() => onStep(-60 * 60 * 1000)}
            title="Back 1h"
          >⏮</button>
          <button
            type="button"
            className="rounded border border-white/15 bg-white/8 px-2 py-1 text-xs text-white hover:bg-white/15"
            onClick={onPlayPause}
            title={animPaused ? 'Play' : 'Pause'}
          >{animPaused ? '▶' : '⏸'}</button>
          <button
            type="button"
            className="rounded border border-white/15 bg-white/8 px-2 py-1 text-xs text-white hover:bg-white/15"
            onClick={() => onStep(60 * 60 * 1000)}
            title="Forward 1h"
          >⏭</button>
          <select
            className="rounded border border-white/15 bg-black/70 px-1 py-1 text-xs text-white"
            defaultValue="1"
            onChange={(e) => api?.setTimeSpeed(Number(e.target.value))}
          >
            <option value="1">1×</option>
            <option value="2">2×</option>
            <option value="5">5×</option>
            <option value="10">10×</option>
            <option value="50">50×</option>
          </select>
          <button
            type="button"
            className="rounded border border-white/15 bg-white/8 px-2 py-1 text-xs text-white hover:bg-white/15"
            onClick={() => api?.jumpToNow()}
            title="Reset to now"
          >⟲</button>
        </div>

      </div>
    </footer>
  )
}