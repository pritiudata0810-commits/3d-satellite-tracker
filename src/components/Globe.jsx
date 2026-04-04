import { useEffect, useRef, useState, useCallback } from 'react'
import Globe from 'globe.gl'
import axios from 'axios'
import * as THREE from 'three'
import { calculatePositions } from '../engine/orbitEngine'

// ─── Color Modes ───────────────────────────────────────────────────────────────
const MODES = {
  inclination: {
    label: 'Inclination',
    color: (s) => {
      const i = s.inclination || 0
      if (i < 30) return '#e63946'
      if (i < 60) return '#ff8c00'
      if (i < 90) return '#ffd700'
      if (i < 120) return '#2ecc40'
      return '#4488ff'
    },
    legend: [
      { c: '#e63946', label: 'Equatorial', range: '0°-30°' },
      { c: '#ff8c00', label: 'Low', range: '30°-60°' },
      { c: '#ffd700', label: 'Medium', range: '60°-90°' },
      { c: '#2ecc40', label: 'High', range: '90°-120°' },
      { c: '#4488ff', label: 'Retrograde', range: '120°-180°' },
    ],
  },
  altitude: {
    label: 'Orbital Altitude',
    color: (s) => {
      const a = s.altKm || 0
      if (a < 400) return '#e63946'
      if (a < 1000) return '#ff8c00'
      if (a < 2000) return '#ffd700'
      if (a < 35786) return '#2ecc40'
      return '#8844ff'
    },
    legend: [
      { c: '#e63946', label: 'VLEO', range: '< 400 km' },
      { c: '#ff8c00', label: 'LEO', range: '400-1000 km' },
      { c: '#ffd700', label: 'MEO', range: '1000-2000 km' },
      { c: '#2ecc40', label: 'HEO', range: '2000-35786 km' },
      { c: '#8844ff', label: 'GEO+', range: '35786+ km' },
    ],
  },
  constellation: {
    label: 'Constellation',
    color: (s) => {
      const map = {
        Starlink: '#ff8c00', GPS: '#2ecc40', GLONASS: '#4488ff',
        OneWeb: '#ff44aa', Iridium: '#ffd700', ISS: '#ff3333',
        Galileo: '#44ffcc', BeiDou: '#ff6644', Other: '#aaaaaa'
      }
      return map[s.constellation] || '#aaaaaa'
    },
    legend: [
      { c: '#ff8c00', label: 'Starlink' },
      { c: '#2ecc40', label: 'GPS' },
      { c: '#4488ff', label: 'GLONASS' },
      { c: '#ff44aa', label: 'OneWeb' },
      { c: '#ffd700', label: 'Iridium' },
      { c: '#ff3333', label: 'ISS' },
      { c: '#aaaaaa', label: 'Other' },
    ],
  },
}

// ─── Toolbar Buttons (icon style like satellitemap.space) ──────────────────────
const TOOLBAR_BTNS = [
  { id: 'home',     icon: '🏠', label: 'Home',      action: 'home' },
  { id: 'rotate',   icon: '🔄', label: 'Auto Rotate', toggle: true, default: true },
  { id: 'grid',     icon: '⊞',  label: 'Grid Lines', toggle: true, default: true },
  { id: 'borders',  icon: '🗺️', label: 'Borders',   toggle: true, default: true },
  { id: 'atmo',     icon: '🌐', label: 'Atmosphere', toggle: true, default: true },
  { id: 'night',    icon: '🌙', label: 'Night Mode', toggle: true, default: false },
  { id: 'clouds',   icon: '☁️', label: 'Clouds',    toggle: true, default: false },
  { id: 'labels',   icon: '🏷️', label: 'Labels',    toggle: true, default: false },
  { id: 'fps60',    icon: '⚡', label: '60 FPS',     toggle: true, default: true },
]

const CONSTELLATIONS = ['All', 'Starlink', 'GPS', 'GLONASS', 'OneWeb', 'Iridium', 'ISS', 'Other']

export default function GlobeView() {
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const tleRef = useRef([])
  const posRef = useRef([])
  const modeRef = useRef('inclination')
  const countriesRef = useRef([])
  const fpsRef = useRef({ frames: 0, last: performance.now() })
  const intervalRef = useRef(null)

  const [count, setCount] = useState(0)
  const [totalLoaded, setTotalLoaded] = useState(0)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('inclination')
  const [fps, setFps] = useState(0)
  const [utc, setUtc] = useState('')
  const [selected, setSelected] = useState(null)
  const [constellation, setConstellation] = useState('All')
  const [activeMenu, setActiveMenu] = useState(null)
  const [toggles, setToggles] = useState({
    rotate: true, grid: true, borders: true,
    atmo: true, night: false, clouds: false, labels: false, fps60: true
  })
  const [distribution, setDistribution] = useState({ Low: 0, Medium: 0, High: 0 })

  // ── UTC Clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      setUtc(`${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`)
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // ── Fetch country borders ──────────────────────────────────────────────────
  async function fetchCountries() {
    try {
      const r = await fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      const geo = await r.json()
      countriesRef.current = geo.features
      if (globeRef.current && toggles.borders) {
        globeRef.current.polygonsData(geo.features)
      }
    } catch (e) { console.log('borders failed', e) }
  }

  // ── Fetch TLE data ─────────────────────────────────────────────────────────
  async function fetchTLEs() {
    try {
      const res = await axios.get('/api/satellites')
      tleRef.current = res.data
      setTotalLoaded(res.data.length)
      setLoading(false)
      console.log('Loaded satellites:', res.data.length)
    } catch (e) {
      console.error('TLE fetch failed', e)
      setLoading(false)
    }
  }

  // ── Compute distribution ───────────────────────────────────────────────────
  const computeDistribution = (positions) => {
    let Low = 0, Medium = 0, High = 0
    positions.forEach(p => {
      const i = p.inclination || 0
      if (i < 60) Low++
      else if (i < 90) Medium++
      else High++
    })
    setDistribution({ Low, Medium, High })
  }

  // ── Globe Setup ────────────────────────────────────────────────────────────
  useEffect(() => {
    const globe = Globe()(containerRef.current)
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
      .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
      .width(window.innerWidth)
      .height(window.innerHeight)
      .showAtmosphere(true)
      .atmosphereColor('#1a6fa8')
      .atmosphereAltitude(0.15)
      .showGraticules(true)
      .polygonsData([])
      .polygonCapColor(() => 'rgba(0,0,0,0)')
      .polygonSideColor(() => 'rgba(100,160,255,0.08)')
      .polygonStrokeColor(() => 'rgba(100,160,255,0.18)')
      .polygonAltitude(0.001)
      .customLayerData([])
      .customThreeObject(d => {
        const geo = new THREE.SphereGeometry(0.8, 6, 6)
        const mat = new THREE.MeshBasicMaterial({ color: d.color || '#ff8c00' })
        return new THREE.Mesh(geo, mat)
      })
      .customThreeObjectUpdate((obj, d) => {
        obj.material.color.set(d.color || '#ff8c00')
        Object.assign(obj.position, globe.getCoords(d.lat, d.lng, d.alt))
      })
      .onCustomLayerClick(d => setSelected(d))

    globeRef.current = globe
    globe.controls().autoRotate = true
    globe.controls().autoRotateSpeed = 0.3

    window.addEventListener('resize', () => {
      globe.width(window.innerWidth)
      globe.height(window.innerHeight)
    })

    // FPS counter
    const countFps = (now) => {
      fpsRef.current.frames++
      if (now - fpsRef.current.last >= 1000) {
        setFps(fpsRef.current.frames)
        fpsRef.current.frames = 0
        fpsRef.current.last = now
      }
      requestAnimationFrame(countFps)
    }
    requestAnimationFrame(countFps)

    fetchCountries()
    fetchTLEs().then(() => {
      intervalRef.current = setInterval(() => {
        if (!tleRef.current.length) return
        const positions = calculatePositions(tleRef.current)
        posRef.current = positions

        const filtered = constellation === 'All'
          ? positions
          : positions.filter(p => p.constellation === constellation)

        const colored = filtered.map(p => ({
          ...p,
          color: MODES[modeRef.current]?.color(p) || '#ff8c00'
        }))
        setCount(filtered.length)
        computeDistribution(filtered)
        globeRef.current?.customLayerData(colored)
      }, 1000)
    })

    setInterval(fetchTLEs, 30 * 60 * 1000)
  }, [])

  // ── Toggle handlers ────────────────────────────────────────────────────────
  const handleToggle = (id) => {
    const g = globeRef.current
    const newVal = !toggles[id]
    setToggles(prev => ({ ...prev, [id]: newVal }))
    if (!g) return
    if (id === 'rotate') g.controls().autoRotate = newVal
    if (id === 'grid') g.showGraticules(newVal)
    if (id === 'atmo') g.showAtmosphere(newVal)
    if (id === 'borders') g.polygonsData(newVal ? countriesRef.current : [])
    if (id === 'night') g.globeImageUrl(newVal
      ? 'https://unpkg.com/three-globe/example/img/earth-night.jpg'
      : 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
  }

  const handleModeChange = (newMode) => {
    setMode(newMode)
    modeRef.current = newMode
    setActiveMenu(null)
    if (!posRef.current.length) return
    const filtered = constellation === 'All'
      ? posRef.current
      : posRef.current.filter(p => p.constellation === constellation)
    const colored = filtered.map(p => ({
      ...p,
      color: MODES[newMode].color(p)
    }))
    globeRef.current?.customLayerData(colored)
  }

  const handleConstellation = (c) => {
    setConstellation(c)
    setActiveMenu(null)
    if (!posRef.current.length) return
    const filtered = c === 'All' ? posRef.current : posRef.current.filter(p => p.constellation === c)
    const colored = filtered.map(p => ({
      ...p,
      color: MODES[modeRef.current]?.color(p) || '#ff8c00'
    }))
    setCount(filtered.length)
    computeDistribution(filtered)
    globeRef.current?.customLayerData(colored)
  }

  const currentLegend = MODES[mode]
  const total = posRef.current.length
  const distPct = (n) => total ? ((n / count) * 100).toFixed(1) : '0.0'

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', userSelect: 'none' }}
      onClick={() => setActiveMenu(null)}>

      {/* ── Globe Canvas ── */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* ── TOP NAV BAR ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 48,
        background: 'rgba(5,10,20,0.90)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', zIndex: 200, gap: 0,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 18, lineHeight: 1 }}>🛰️</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'white', letterSpacing: 0.5 }}>3D Satellite Tracker</div>
        </div>

        {/* Nav items */}
        {[
          { label: 'Constellations', items: CONSTELLATIONS },
          { label: 'Color Mode', items: Object.keys(MODES).map(k => MODES[k].label) },
          { label: 'View' },
          { label: 'About' },
        ].map((item) => (
          <div key={item.label} style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setActiveMenu(activeMenu === item.label ? null : item.label) }}
              style={{
                background: activeMenu === item.label ? 'rgba(100,160,255,0.15)' : 'transparent',
                border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                padding: '0 16px', height: 48, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
              onMouseLeave={e => e.currentTarget.style.background = activeMenu === item.label ? 'rgba(100,160,255,0.15)' : 'transparent'}
            >
              {item.label} {item.items && <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>}
            </button>
            {activeMenu === item.label && item.items && (
              <div onClick={e => e.stopPropagation()} style={{
                position: 'absolute', top: 48, left: 0,
                background: 'rgba(5,10,20,0.97)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0 0 8px 8px',
                minWidth: 160, zIndex: 300,
                backdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              }}>
                {item.items.map(opt => (
                  <button key={opt} onClick={() => {
                    if (item.label === 'Constellations') handleConstellation(opt)
                    else if (item.label === 'Color Mode') {
                      const key = Object.keys(MODES).find(k => MODES[k].label === opt)
                      if (key) handleModeChange(key)
                    }
                  }} style={{
                    display: 'block', width: '100%', padding: '10px 16px',
                    background: 'transparent', border: 'none',
                    color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
                    fontSize: 12, textAlign: 'left', transition: 'background 0.15s',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,160,255,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >{opt}</button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Live indicator */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingRight: 20 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: loading ? '#ffd700' : '#2ecc40', boxShadow: `0 0 8px ${loading ? '#ffd700' : '#2ecc40'}` }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            {loading ? 'Loading...' : 'LIVE'}
          </span>
        </div>
      </div>

      {/* ── TOP LEFT: Title + Count ── */}
      <div style={{ position: 'fixed', top: 68, left: 24, pointerEvents: 'none', zIndex: 100 }}>
        <div style={{ fontSize: 42, fontWeight: 900, color: 'white', opacity: 0.18, letterSpacing: 2, textTransform: 'lowercase', lineHeight: 1 }}>
          {constellation === 'All' ? 'all satellites' : constellation.toLowerCase()}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
          {loading ? '⏳ Loading satellite data...' : `${count.toLocaleString()} satellites`}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{
        position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)',
        background: 'rgba(5,10,20,0.88)',
        borderRadius: '12px 0 0 12px',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRight: 'none',
        padding: '20px 18px',
        color: 'white',
        minWidth: 250,
        backdropFilter: 'blur(16px)',
        zIndex: 100,
      }}>
        {/* Mode title */}
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, letterSpacing: 0.5 }}>
          {currentLegend.label}
        </div>

        {/* Legend items */}
        {currentLegend.legend.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
            <div style={{
              width: 13, height: 13, borderRadius: '50%',
              background: item.c, boxShadow: `0 0 8px ${item.c}99`,
              flexShrink: 0
            }} />
            <span style={{ fontSize: 12, opacity: 0.85, flex: 1 }}>{item.label}</span>
            {item.range && <span style={{ fontSize: 10, opacity: 0.35, fontFamily: 'monospace' }}>{item.range}</span>}
          </div>
        ))}

        {/* Distribution */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 16, paddingTop: 14 }}>
          <div style={{ fontSize: 10, opacity: 0.35, marginBottom: 10, letterSpacing: 1 }}>
            DISTRIBUTION ({count.toLocaleString()} satellites)
          </div>
          {[
            { label: 'Low', n: distribution.Low },
            { label: 'Medium', n: distribution.Medium },
            { label: 'High', n: distribution.High },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11 }}>
              <span style={{ opacity: 0.65 }}>{row.label}</span>
              <span style={{ fontFamily: 'monospace', opacity: 0.85 }}>
                {row.n.toLocaleString()} <span style={{ opacity: 0.4 }}>({distPct(row.n)}%)</span>
              </span>
            </div>
          ))}
        </div>

        {/* Color mode switcher */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 14, paddingTop: 14 }}>
          <div style={{ fontSize: 10, opacity: 0.35, marginBottom: 10, letterSpacing: 1 }}>COLOR MODE</div>
          {Object.entries(MODES).map(([key, val]) => (
            <button key={key} onClick={() => handleModeChange(key)} style={{
              width: '100%', marginBottom: 6, padding: '7px 10px',
              borderRadius: 6, cursor: 'pointer', fontSize: 11, textAlign: 'left',
              border: `1px solid ${mode === key ? 'rgba(100,160,255,0.5)' : 'rgba(255,255,255,0.07)'}`,
              background: mode === key ? 'rgba(100,160,255,0.18)' : 'transparent',
              color: 'white', transition: 'all 0.2s',
            }}>
              {val.label}
            </button>
          ))}
        </div>

        {/* Nav arrows */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, justifyContent: 'center' }}>
          {['◀', '■', '▶'].map((sym, i) => (
            <button key={i} style={{
              flex: 1, padding: '7px 0', borderRadius: 6,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
              fontSize: 12, transition: 'all 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,160,255,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            >{sym}</button>
          ))}
        </div>
      </div>

      {/* ── BOTTOM TOOLBAR ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center',
        background: 'rgba(5,10,20,0.90)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
        padding: '6px 16px', zIndex: 200, height: 56,
      }}>
        {/* Icon buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {TOOLBAR_BTNS.map(btn => (
            <button
              key={btn.id}
              title={btn.label}
              onClick={() => btn.toggle && handleToggle(btn.id)}
              style={{
                width: 40, height: 40, borderRadius: 8,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', transition: 'all 0.2s', fontSize: 16,
                background: (btn.toggle && toggles[btn.id]) ? 'rgba(100,160,255,0.25)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${(btn.toggle && toggles[btn.id]) ? 'rgba(100,160,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: (btn.toggle && toggles[btn.id]) ? 'white' : 'rgba(255,255,255,0.45)',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,160,255,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = (btn.toggle && toggles[btn.id]) ? 'rgba(100,160,255,0.25)' : 'rgba(255,255,255,0.06)'}
            >
              <span style={{ fontSize: 14 }}>{btn.icon}</span>
              <span style={{ fontSize: 7, marginTop: 1, opacity: 0.5, letterSpacing: 0.3 }}>
                {btn.label.length > 5 ? btn.label.slice(0, 5) : btn.label}
              </span>
            </button>
          ))}
        </div>

        {/* Center label */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }}>
            {toggles.clouds ? 'CLOUDS ON' : 'CLOUDS OFF'}
          </div>
        </div>

        {/* Right: FPS + UTC */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            background: 'rgba(255,255,255,0.06)', borderRadius: 6,
            padding: '4px 10px', fontSize: 12,
            color: fps >= 50 ? '#2ecc40' : fps >= 30 ? '#ffd700' : '#e63946',
            fontWeight: 'bold', fontFamily: 'monospace', border: '1px solid rgba(255,255,255,0.07)',
          }}>
            {fps} FPS
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', letterSpacing: 0.5, textDecoration: 'underline', cursor: 'pointer' }}>
            {utc}
          </div>
        </div>
      </div>

      {/* ── SATELLITE CLICK POPUP ── */}
      {selected && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(5,10,20,0.97)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 14, padding: '24px 28px',
          color: 'white', fontFamily: 'monospace',
          minWidth: 290, backdropFilter: 'blur(24px)', zIndex: 300,
          boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, alignItems: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 'bold' }}>🛰️ {selected.name}</div>
            <button onClick={() => setSelected(null)} style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: 16,
              width: 28, height: 28, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 2.4 }}>
            <div>📍 Latitude: <b style={{ color: '#4fc3f7' }}>{selected.lat?.toFixed(4)}°</b></div>
            <div>📍 Longitude: <b style={{ color: '#4fc3f7' }}>{selected.lng?.toFixed(4)}°</b></div>
            <div>🌐 Altitude: <b style={{ color: '#ff8c00' }}>{selected.altKm} km</b></div>
            <div>📐 Inclination: <b style={{ color: '#ffd700' }}>{selected.inclination}°</b></div>
            <div>🏷️ Constellation: <b style={{ color: '#2ecc40' }}>{selected.constellation || 'Unknown'}</b></div>
          </div>
        </div>
      )}
    </div>
  )
}