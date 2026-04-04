import { useEffect, useRef, useState } from 'react'
import Globe from 'globe.gl'
import axios from 'axios'
import { calculatePositions } from '../engine/orbitEngine'

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
      { c: '#ff8c00', label: 'Low',        range: '30°-60°' },
      { c: '#ffd700', label: 'Medium',     range: '60°-90°' },
      { c: '#2ecc40', label: 'High',       range: '90°-120°' },
      { c: '#4488ff', label: 'Retrograde', range: '120°-180°' },
    ],
  },
  altitude: {
    label: 'Orbital Altitude',
    color: (s) => {
      const a = s.altKm || 0
      if (a < 400)   return '#e63946'
      if (a < 1000)  return '#ff8c00'
      if (a < 2000)  return '#ffd700'
      if (a < 35786) return '#2ecc40'
      return '#8844ff'
    },
    legend: [
      { c: '#e63946', label: 'VLEO', range: '< 400 km' },
      { c: '#ff8c00', label: 'LEO',  range: '400-1000 km' },
      { c: '#ffd700', label: 'MEO',  range: '1000-2000 km' },
      { c: '#2ecc40', label: 'HEO',  range: '2000-35786 km' },
      { c: '#8844ff', label: 'GEO+', range: '35786+ km' },
    ],
  },
  constellation: {
    label: 'Constellation',
    color: (s) => {
      const map = {
        Starlink: '#ff8c00', GPS: '#2ecc40', GLONASS: '#4488ff',
        OneWeb: '#ff44aa', Iridium: '#ffd700', ISS: '#ff3333',
        Galileo: '#44ffcc', BeiDou: '#ff6644', Other: '#888888',
      }
      return map[s.constellation] || '#888888'
    },
    legend: [
      { c: '#ff8c00', label: 'Starlink' },
      { c: '#2ecc40', label: 'GPS' },
      { c: '#4488ff', label: 'GLONASS' },
      { c: '#ff44aa', label: 'OneWeb' },
      { c: '#ffd700', label: 'Iridium' },
      { c: '#ff3333', label: 'ISS' },
      { c: '#888888', label: 'Other' },
    ],
  },
}

const CONSTELLATIONS = ['All', 'Starlink', 'GPS', 'GLONASS', 'OneWeb', 'Iridium', 'ISS', 'Other']

const TOOLBAR = [
  { id: 'home',    icon: '⌂',  tip: 'Home',        toggle: false },
  { id: 'rotate',  icon: '↻',  tip: 'Auto Rotate', toggle: true,  def: true  },
  { id: 'grid',    icon: '⊞',  tip: 'Grid Lines',  toggle: true,  def: true  },
  { id: 'borders', icon: '🗺', tip: 'Borders',      toggle: true,  def: true  },
  { id: 'atmo',    icon: '◎',  tip: 'Atmosphere',  toggle: true,  def: true  },
  { id: 'stars',   icon: '✦',  tip: 'Stars',       toggle: true,  def: true  },
  { id: 'sun',     icon: '☀',  tip: 'Sun Lighting', toggle: true,  def: false },
  { id: 'clouds',  icon: '☁',  tip: 'Clouds',       toggle: true,  def: false },
  { id: 'dish',    icon: '📡', tip: 'Constellations', toggle: false },
  { id: 'fps30',   icon: '30', tip: 'FPS',          toggle: true,  def: true, isText: true },
]

export default function GlobeView() {
  const containerRef  = useRef(null)
  const globeRef      = useRef(null)
  const tleRef        = useRef([])
  const posRef        = useRef([])
  const modeRef       = useRef('inclination')
  const constellRef   = useRef('All')
  const countriesRef  = useRef([])
  const fpsRef        = useRef({ frames: 0, last: performance.now() })

  const [count,        setCount]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [mode,         setMode]         = useState('inclination')
  const [fps,          setFps]          = useState(0)
  const [utc,          setUtc]          = useState('')
  const [selected,     setSelected]     = useState(null)
  const [constellation, setConstellation] = useState('All')
  const [activeMenu,   setActiveMenu]   = useState(null)
  const [tooltip,      setTooltip]      = useState(null)
  const [toggles,      setToggles]      = useState(
    Object.fromEntries(TOOLBAR.filter(b => b.toggle).map(b => [b.id, b.def]))
  )
  const [dist, setDist] = useState({ Low: 0, Medium: 0, High: 0 })

  useEffect(() => {
    const t = setInterval(() => {
      const n   = new Date()
      const pad = v => String(v).padStart(2, '0')
      setUtc(`${n.getUTCFullYear()}-${pad(n.getUTCMonth()+1)}-${pad(n.getUTCDate())} ` +
             `${pad(n.getUTCHours())}:${pad(n.getUTCMinutes())}:${pad(n.getUTCSeconds())} UTC`)
    }, 1000)
    return () => clearInterval(t)
  }, [])

  async function fetchCountries() {
    try {
      const r   = await fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
      const geo = await r.json()
      countriesRef.current = geo.features
      if (globeRef.current) globeRef.current.polygonsData(geo.features)
    } catch (e) { console.log('borders failed', e) }
  }

  async function fetchTLEs() {
    try {
      const res = await axios.get('/api/satellites')
      tleRef.current = res.data
      setLoading(false)
      console.log('✅ Loaded:', res.data.length, 'satellites')
      return res.data
    } catch (e) {
      console.error('TLE fetch failed', e)
      setLoading(false)
      return []
    }
  }

  const computeDist = (positions) => {
    let Low = 0, Medium = 0, High = 0
    positions.forEach(p => {
      const i = p.inclination || 0
      if (i < 60) Low++; else if (i < 90) Medium++; else High++
    })
    setDist({ Low, Medium, High })
  }

  const applyFilter = (positions, currentMode, currentConst) => {
    const filtered = currentConst === 'All'
      ? positions
      : positions.filter(p => p.constellation === currentConst)
    
    const colored = filtered.map(p => ({
      ...p,
      color: MODES[currentMode]?.color(p) || '#ff8c00',
    }))
    
    setCount(filtered.length)
    computeDist(filtered)
    
    // Switch from custom objects to highly optimized points
    if (globeRef.current) {
      globeRef.current.pointsData(colored)
    }
  }

  useEffect(() => {
    const globe = Globe()(containerRef.current)
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg') // Dark aesthetic
      .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
      .width(window.innerWidth)
      .height(window.innerHeight - 48 - 56)
      .showAtmosphere(true)
      .atmosphereColor('#002244')
      .atmosphereAltitude(0.15)
      .showGraticules(true)
      .polygonsData([])
      .polygonCapColor(() => 'rgba(0,0,0,0.4)') // Dark oceans/land
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor(() => 'rgba(80,140,255,0.3)') // Crisp blue borders
      .polygonAltitude(0.005)
      // Optimized rendering for thousands of dots
      .pointLat('lat')
      .pointLng('lng')
      .pointAltitude('alt')
      .pointColor('color')
      .pointRadius(0.015) // Tiny points exactly like the image
      .pointResolution(8)
      .onPointClick(d => setSelected(d))

    globeRef.current = globe
    globe.controls().autoRotate      = true
    globe.controls().autoRotateSpeed = 0.3

    window.addEventListener('resize', () => {
      globe.width(window.innerWidth)
      globe.height(window.innerHeight - 48 - 56)
    })

    const countFps = (now) => {
      fpsRef.current.frames++
      if (now - fpsRef.current.last >= 1000) {
        setFps(fpsRef.current.frames)
        fpsRef.current.frames = 0
        fpsRef.current.last   = now
      }
      requestAnimationFrame(countFps)
    }
    requestAnimationFrame(countFps)

    fetchCountries()
    
    // Force immediate first calculation to fix the "0 satellites" bug
    fetchTLEs().then((data) => {
      if (!data || data.length === 0) return
      
      const initialPositions = calculatePositions(data)
      posRef.current = initialPositions
      applyFilter(initialPositions, modeRef.current, constellRef.current)

      setInterval(() => {
        if (!tleRef.current.length) return
        const positions = calculatePositions(tleRef.current)
        posRef.current  = positions
        applyFilter(positions, modeRef.current, constellRef.current)
      }, 1000)
    })

    setInterval(fetchTLEs, 30 * 60 * 1000)
  }, [])

  const handleToggle = (id) => {
    const g      = globeRef.current
    const newVal = !toggles[id]
    setToggles(prev => ({ ...prev, [id]: newVal }))
    if (!g) return
    if (id === 'rotate')  g.controls().autoRotate = newVal
    if (id === 'grid')    g.showGraticules(newVal)
    if (id === 'atmo')    g.showAtmosphere(newVal)
    if (id === 'borders') g.polygonsData(newVal ? countriesRef.current : [])
    if (id === 'sun') {
      g.globeImageUrl(newVal
        ? 'https://unpkg.com/three-globe/example/img/earth-day.jpg'
        : 'https://unpkg.com/three-globe/example/img/earth-dark.jpg')
    }
  }

  const handleModeChange = (newMode) => {
    setMode(newMode)
    modeRef.current = newMode
    setActiveMenu(null)
    applyFilter(posRef.current, newMode, constellRef.current)
  }

  const handleConstellation = (c) => {
    setConstellation(c)
    constellRef.current = c
    setActiveMenu(null)
    applyFilter(posRef.current, modeRef.current, c)
  }

  const legend = MODES[mode]
  const total  = count || 1

  // Note: The UI JSX (<div> structure) remains exactly the same as your original file.
  // Paste your entire return ( <div style={{ width: '100vw', height: '100vh', ... ) block here.
  return (
    <div
      style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}
      onClick={() => setActiveMenu(null)}
    >
      {/* ── TOP NAV ─────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 48,
        background: 'rgba(4,9,20,0.93)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', zIndex: 200,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px', borderRight: '1px solid rgba(255,255,255,0.08)', height: '100%' }}>
          <span style={{ fontSize: 18 }}>🛰️</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: 0.4 }}>3D Satellite Tracker</span>
        </div>

        {[
          { label: 'Constellations', items: CONSTELLATIONS,                 handler: handleConstellation },
          { label: 'Color Mode',     items: Object.entries(MODES).map(([k,v]) => ({ key: k, label: v.label })), handler: (k) => handleModeChange(k) },
          { label: 'Types' },
          { label: 'Functions' },
          { label: 'More' },
        ].map(nav => (
          <div key={nav.label} style={{ position: 'relative', height: '100%' }}>
            <button
              onClick={e => { e.stopPropagation(); setActiveMenu(activeMenu === nav.label ? null : nav.label) }}
              style={{
                height: '100%', padding: '0 15px',
                background: activeMenu === nav.label ? 'rgba(100,160,255,0.12)' : 'transparent',
                border: 'none', borderBottom: activeMenu === nav.label ? '2px solid rgba(100,160,255,0.7)' : '2px solid transparent',
                color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s',
              }}
            >
              {nav.label} {nav.items && <span style={{ fontSize: 8, opacity: 0.5 }}>▼</span>}
            </button>
            {activeMenu === nav.label && nav.items && (
              <div onClick={e => e.stopPropagation()} style={{
                position: 'absolute', top: 48, left: 0,
                background: 'rgba(4,9,20,0.98)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0 0 8px 8px',
                minWidth: 170, zIndex: 400,
                backdropFilter: 'blur(20px)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
              }}>
                {nav.items.map(item => {
                  const key   = typeof item === 'string' ? item : item.key
                  const label = typeof item === 'string' ? item : item.label
                  return (
                    <button key={key} onClick={() => nav.handler(key)} style={{
                      display: 'block', width: '100%', padding: '9px 16px',
                      background: 'transparent', border: 'none',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 12, textAlign: 'left',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,160,255,0.14)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >{label}</button>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, paddingRight: 20 }}>
          {['Share', 'Install'].map(lbl => (
            <button key={lbl} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.65)', cursor: 'pointer', padding: '4px 12px',
              borderRadius: 5, fontSize: 12,
            }}>{lbl}</button>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: loading ? '#ffd700' : '#2ecc40',
              boxShadow: `0 0 8px ${loading ? '#ffd700' : '#2ecc40'}`,
              animation: 'pulse 2s infinite',
            }} />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
              {loading ? 'Loading…' : 'LIVE'}
            </span>
          </div>
        </div>
      </div>

      {/* ── GLOBE ───────────────────────────────────────────────── */}
      <div ref={containerRef} style={{ position: 'absolute', top: 48, left: 0, right: 0, bottom: 56 }} />

      {/* ── TOP LEFT title ─────────────────────────────────────── */}
      <div style={{ position: 'fixed', top: 68, left: 24, pointerEvents: 'none', zIndex: 100 }}>
        <div style={{ fontSize: 40, fontWeight: 900, color: 'white', opacity: 0.18, letterSpacing: 2, textTransform: 'lowercase', lineHeight: 1.1 }}>
          {constellation === 'All' ? 'all satellites' : constellation.toLowerCase()}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 5 }}>
          {loading ? '⏳ Loading satellite data…' : `${count.toLocaleString()} satellites`}
        </div>
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)',
        background: 'rgba(4,9,20,0.90)',
        borderRadius: '12px 0 0 12px',
        border: '1px solid rgba(255,255,255,0.08)', borderRight: 'none',
        padding: '20px 18px', color: 'white', minWidth: 255,
        backdropFilter: 'blur(18px)', zIndex: 100,
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18, letterSpacing: 0.4 }}>
          {legend.label}
        </div>

        {legend.legend.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 13, height: 13, borderRadius: '50%', background: item.c, boxShadow: `0 0 8px ${item.c}99`, flexShrink: 0 }} />
            <span style={{ fontSize: 12, opacity: 0.85, flex: 1 }}>{item.label}</span>
            {item.range && <span style={{ fontSize: 10, opacity: 0.35, fontFamily: 'monospace' }}>{item.range}</span>}
          </div>
        ))}

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 16, paddingTop: 14 }}>
          <div style={{ fontSize: 10, opacity: 0.35, marginBottom: 10, letterSpacing: 1 }}>
            DISTRIBUTION ({count.toLocaleString()} satellites)
          </div>
          {[
            { label: 'Low',    n: dist.Low },
            { label: 'Medium', n: dist.Medium },
            { label: 'High',   n: dist.High },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
              <span style={{ opacity: 0.6 }}>{row.label}</span>
              <span style={{ fontFamily: 'monospace', opacity: 0.85 }}>
                {row.n.toLocaleString()} <span style={{ opacity: 0.4 }}>({((row.n / total) * 100).toFixed(1)}%)</span>
              </span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 14, paddingTop: 14 }}>
          <div style={{ fontSize: 10, opacity: 0.35, marginBottom: 10, letterSpacing: 1 }}>COLOR MODE</div>
          {Object.entries(MODES).map(([key, val]) => (
            <button key={key} onClick={() => handleModeChange(key)} style={{
              width: '100%', marginBottom: 6, padding: '7px 10px', borderRadius: 6,
              cursor: 'pointer', fontSize: 11, textAlign: 'left',
              border: `1px solid ${mode === key ? 'rgba(100,160,255,0.5)' : 'rgba(255,255,255,0.07)'}`,
              background: mode === key ? 'rgba(100,160,255,0.18)' : 'transparent',
              color: 'white', transition: 'all 0.2s',
            }}>{val.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          {['◀', '=', '▶'].map((sym, i) => (
            <button key={i} style={{
              flex: 1, padding: '7px 0', borderRadius: 6,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13,
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,160,255,0.18)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >{sym}</button>
          ))}
        </div>
      </div>

      {/* ── BOTTOM TOOLBAR ──────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
        background: 'rgba(4,9,20,0.93)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(14px)',
        display: 'flex', alignItems: 'center', padding: '0 16px', zIndex: 200,
      }}>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {TOOLBAR.map(btn => {
            const isOn = btn.toggle ? toggles[btn.id] : false
            return (
              <div key={btn.id} style={{ position: 'relative' }}
                onMouseEnter={() => setTooltip(btn.id)}
                onMouseLeave={() => setTooltip(null)}
              >
                <button
                  onClick={() => btn.toggle && handleToggle(btn.id)}
                  style={{
                    width: 42, height: 42, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: btn.toggle ? 'pointer' : 'default',
                    fontSize: btn.isText ? 11 : 18,
                    fontWeight: btn.isText ? 700 : 400,
                    fontFamily: btn.isText ? 'monospace' : 'inherit',
                    background: isOn ? 'rgba(100,160,255,0.22)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${isOn ? 'rgba(100,160,255,0.45)' : 'rgba(255,255,255,0.10)'}`,
                    color: isOn ? '#a8d4ff' : 'rgba(255,255,255,0.45)',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(100,160,255,0.22)'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isOn ? 'rgba(100,160,255,0.22)' : 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = isOn ? '#a8d4ff' : 'rgba(255,255,255,0.45)' }}
                >
                  {btn.icon}
                </button>
                {tooltip === btn.id && (
                  <div style={{
                    position: 'absolute', bottom: 50, left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(4,9,20,0.97)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6, padding: '5px 10px',
                    fontSize: 11, color: 'rgba(255,255,255,0.85)',
                    whiteSpace: 'nowrap', zIndex: 500,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                  }}>
                    {btn.tip}
                    <div style={{ position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)', width: 8, height: 8, background: 'rgba(4,9,20,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderTop: 'none', borderLeft: 'none', rotate: '45deg' }} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: 1 }}>
          {toggles.clouds ? 'CLOUDS ON' : 'CLOUDS OFF'}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: '4px 10px',
            fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
            color: fps >= 50 ? '#2ecc40' : fps >= 30 ? '#ffd700' : '#e63946',
          }}>{fps} FPS</div>
          <div style={{
            fontSize: 12, color: 'rgba(255,255,255,0.55)',
            fontFamily: 'monospace', letterSpacing: 0.5,
            textDecoration: 'underline', cursor: 'pointer',
            textUnderlineOffset: 3,
          }}>{utc}</div>
        </div>
      </div>

      {selected && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(4,9,20,0.97)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 14, padding: '24px 28px',
          color: 'white', fontFamily: 'monospace',
          minWidth: 290, backdropFilter: 'blur(24px)', zIndex: 400,
          boxShadow: '0 16px 56px rgba(0,0,0,0.8)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 'bold' }}>🛰️ {selected.name}</div>
            <button onClick={() => setSelected(null)} style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 15,
              width: 28, height: 28, borderRadius: 6,
            }}>✕</button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 2.4 }}>
            <div>📍 Latitude:      <b style={{ color: '#4fc3f7' }}>{selected.lat?.toFixed(4)}°</b></div>
            <div>📍 Longitude:     <b style={{ color: '#4fc3f7' }}>{selected.lng?.toFixed(4)}°</b></div>
            <div>🌐 Altitude:      <b style={{ color: '#ff8c00' }}>{selected.altKm} km</b></div>
            <div>📐 Inclination:   <b style={{ color: '#ffd700' }}>{selected.inclination}°</b></div>
            <div>🏷️ Constellation: <b style={{ color: '#2ecc40' }}>{selected.constellation || 'Unknown'}</b></div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}