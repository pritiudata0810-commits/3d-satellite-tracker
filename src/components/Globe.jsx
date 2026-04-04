import { useCallback, useEffect, useRef, useState } from 'react'
import Globe from 'globe.gl'
import axios from 'axios'
import * as THREE from 'three'
import { calculatePositions, inclinationHistogram } from '../engine/orbitEngine'

const BOUNDARIES_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v4.0.0/geojson/ne_110m_admin_0_boundary_lines_land.geojson'

const MODES = {
  inclination: {
    label: 'Inclination',
    color: (s) => {
      if (s.inclination < 30) return '#e63946'
      if (s.inclination < 60) return '#ff8c00'
      if (s.inclination < 90) return '#ffd700'
      if (s.inclination < 120) return '#2ecc40'
      return '#4488ff'
    },
    legend: [
      { c: '#e63946', label: 'Equatorial', range: '0° - 30°' },
      { c: '#ff8c00', label: 'Low', range: '30° - 60°' },
      { c: '#ffd700', label: 'Medium', range: '60° - 90°' },
      { c: '#2ecc40', label: 'High', range: '90° - 120°' },
      { c: '#4488ff', label: 'Retrograde', range: '120° - 180°' },
    ],
  },
  altitude: {
    label: 'Orbital Altitude',
    color: (s) => {
      if (s.altKm < 400) return '#e63946'
      if (s.altKm < 1000) return '#ff8c00'
      if (s.altKm < 2000) return '#ffd700'
      if (s.altKm < 35786) return '#2ecc40'
      return '#8844ff'
    },
    legend: [
      { c: '#e63946', label: 'VLEO', range: '< 400 km' },
      { c: '#ff8c00', label: 'LEO', range: '400–1000 km' },
      { c: '#ffd700', label: 'MEO', range: '1000–2000 km' },
      { c: '#2ecc40', label: 'HEO', range: '2000–35786 km' },
      { c: '#8844ff', label: 'GEO+', range: '35786+ km' },
    ],
  },
}

const btnPlayback = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
}

const NAV_LINKS = [
  { key: 'about', label: 'About', items: ['Mission', 'Data sources', 'Credits'] },
  { key: 'news', label: 'News', items: ['Updates', 'RSS'] },
  { key: 'constellations', label: 'Constellations', items: ['Starlink', 'OneWeb', 'GPS', 'GLONASS', 'Iridium'] },
  { key: 'types', label: 'Types', items: ['Payload', 'Rocket body', 'Debris'] },
  { key: 'functions', label: 'Functions', items: ['Navigation', 'Communications', 'Weather'] },
  { key: 'more', label: 'More', items: ['API', 'Contact'] },
]

function boundaryGeoToPaths(geojson, alt = 0.0045) {
  const paths = []
  for (const f of geojson.features || []) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'LineString') {
      paths.push(g.coordinates.map(([lng, lat]) => [lat, lng, alt]))
    } else if (g.type === 'MultiLineString') {
      for (const line of g.coordinates) {
        paths.push(line.map(([lng, lat]) => [lat, lng, alt]))
      }
    }
  }
  return paths
}

function formatUtc(d) {
  const pad = (n) => String(n).padStart(2, '0')
  const mo = pad(d.getUTCMonth() + 1)
  const day = pad(d.getUTCDate())
  const y = d.getUTCFullYear() % 100
  const h = pad(d.getUTCHours())
  const m = pad(d.getUTCMinutes())
  const s = pad(d.getUTCSeconds())
  return `${mo}/${day}/${y} ${h}:${m}:${s} UTC`
}

export default function GlobeView() {
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const tleRef = useRef([])
  const posRef = useRef([])
  const modeRef = useRef('inclination')
  const simTimeRef = useRef(new Date())
  const animPausedRef = useRef(false)

  const [count, setCount] = useState(0)
  const [mode, setMode] = useState('inclination')
  const [utcStr, setUtcStr] = useState('')
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [panelOpen, setPanelOpen] = useState(true)
  const [openMenu, setOpenMenu] = useState(null)
  const [fps, setFps] = useState(0)
  const [animPaused, setAnimPaused] = useState(false)
  const [hist, setHist] = useState(null)
  const cloudsOn = false
  const [dataSource, setDataSource] = useState('')

  const handleModeChange = useCallback((newMode) => {
    setMode(newMode)
    modeRef.current = newMode
    if (!posRef.current.length || !globeRef.current) return
    const colored = posRef.current.map((p) => ({
      ...p,
      color: MODES[newMode].color(p),
    }))
    globeRef.current.customLayerData(colored)
  }, [])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    animPausedRef.current = animPaused
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = !animPaused
    }
  }, [animPaused])

  const fetchTLEs = useCallback(async () => {
    try {
      setFetchError(null)
      const res = await axios.get('/api/satellites')
      tleRef.current = res.data
      setCount(res.data.length)
      setLoading(false)
      const src = res.headers['x-satellite-source']
      if (src) setDataSource(src)
    } catch (e) {
      console.error('Fetch failed', e)
      setFetchError(e.response?.data?.error || e.message || 'Failed to load satellites')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const globe = Globe()(containerRef.current)
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
      .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
      .width(window.innerWidth)
      .height(window.innerHeight)
      .showGraticules(true)
      .showAtmosphere(true)
      .atmosphereColor('#3a7dff')
      .atmosphereAltitude(0.18)
      .customLayerData([])
      .customThreeObject((d) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.45, 5, 5),
          new THREE.MeshBasicMaterial({ color: d.color || '#ff8c00' })
        )
        mesh.userData = d
        return mesh
      })
      .customThreeObjectUpdate((obj, d) => {
        const pos = globe.getCoords(d.lat, d.lng, d.alt)
        if (pos) {
          obj.position.x = pos.x
          obj.position.y = pos.y
          obj.position.z = pos.z
        }
        if (obj.material) obj.material.color.set(d.color || '#ff8c00')
      })
      .onCustomLayerClick((d) => setSelected(d))

    globeRef.current = globe
    globe.controls().autoRotate = true
    globe.controls().autoRotateSpeed = 0.35
    globe.pointOfView({ altitude: 2.35 })

    const onResize = () => {
      globe.width(window.innerWidth)
      globe.height(window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    fetch(BOUNDARIES_URL)
      .then((r) => r.json())
      .then((geo) => {
        const paths = boundaryGeoToPaths(geo, 0.0045)
        globe
          .pathsData(paths)
          .pathColor(() => 'rgba(255,255,255,0.95)')
          .pathStroke(1.15)
      })
      .catch(() => {})

    fetchTLEs()

    const tick = () => {
      if (!tleRef.current.length || !globeRef.current) return
      const when = animPausedRef.current ? simTimeRef.current : new Date()
      if (!animPausedRef.current) simTimeRef.current = new Date()
      const positions = calculatePositions(tleRef.current, when)
      posRef.current = positions
      const m = modeRef.current
      const colored = positions.map((p) => ({
        ...p,
        color: MODES[m]?.color(p) || '#ff8c00',
      }))
      globeRef.current.customLayerData(colored)
      setHist(inclinationHistogram(positions))
    }

    tick()
    const posInterval = setInterval(tick, 1000)

    const refreshTle = setInterval(fetchTLEs, 65 * 60 * 1000)

    return () => {
      clearInterval(posInterval)
      clearInterval(refreshTle)
      window.removeEventListener('resize', onResize)
    }
  }, [fetchTLEs])

  useEffect(() => {
    const t = setInterval(() => {
      const d = animPausedRef.current ? simTimeRef.current : new Date()
      setUtcStr(formatUtc(d))
    }, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf
    const loop = (now) => {
      frames++
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const close = (e) => {
      if (!e.target.closest?.('.nav-dd')) setOpenMenu(null)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const stepSim = (deltaMs) => {
    simTimeRef.current = new Date(simTimeRef.current.getTime() + deltaMs)
    setUtcStr(formatUtc(simTimeRef.current))
    if (!tleRef.current.length || !globeRef.current) return
    const positions = calculatePositions(tleRef.current, simTimeRef.current)
    posRef.current = positions
    const m = modeRef.current
    const colored = positions.map((p) => ({
      ...p,
      color: MODES[m]?.color(p) || '#ff8c00',
    }))
    globeRef.current.customLayerData(colored)
    setHist(inclinationHistogram(positions))
  }

  const currentMode = MODES[mode]
  const bucketRows = hist
    ? [
        { key: 'equatorial', label: 'Equatorial', n: hist.buckets.equatorial },
        { key: 'low', label: 'Low', n: hist.buckets.low },
        { key: 'medium', label: 'Medium', n: hist.buckets.medium },
        { key: 'high', label: 'High', n: hist.buckets.high },
        { key: 'retrograde', label: 'Retrograde', n: hist.buckets.retrograde },
      ]
    : []

  return (
    <div className="globe-app" style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      <header
        className="globe-topbar"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px 10px 16px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 85%, transparent 100%)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div
            style={{
              fontFamily: "'Segoe UI', system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 17,
              letterSpacing: 0.2,
            }}
          >
            <span style={{ color: '#5af' }}>satellite</span>
            <span style={{ color: '#fff' }}>map</span>
            <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>.space</span>
          </div>
        </div>

        <nav
          className="nav-dd"
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexWrap: 'wrap',
            justifyContent: 'center',
            flex: 1,
            maxWidth: 720,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {NAV_LINKS.map((item) => (
            <div key={item.key} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setOpenMenu(openMenu === item.key ? null : item.key)}
                style={{
                  background: openMenu === item.key ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: 'none',
                  color: 'rgba(255,255,255,0.88)',
                  fontSize: 13,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderRadius: 6,
                  fontFamily: 'system-ui, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {item.label}
                <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>
              </button>
              {openMenu === item.key && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: 4,
                    minWidth: 180,
                    background: 'rgba(8,12,22,0.96)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    padding: '6px 0',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
                  }}
                >
                  {item.items.map((sub) => (
                    <div
                      key={sub}
                      style={{
                        padding: '8px 14px',
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.85)',
                        cursor: 'default',
                      }}
                    >
                      {sub}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {['Share', 'Install', 'Search'].map((a) => (
            <button
              key={a}
              type="button"
              title={a}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.75)',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              {a === 'Search' ? '🔍' : a === 'Share' ? '↗' : '⬇'}
            </button>
          ))}
        </div>
      </header>

      <div
        style={{
          position: 'fixed',
          top: 56,
          left: 20,
          zIndex: 12,
          pointerEvents: 'none',
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 900,
            opacity: 0.18,
            letterSpacing: 2,
            textTransform: 'lowercase',
            color: '#fff',
            lineHeight: 1,
          }}
        >
          live catalog
        </div>
        <div style={{ fontSize: 12, opacity: 0.55, marginTop: 6, color: '#fff' }}>
          {loading ? 'Loading ephemeris…' : `${count.toLocaleString()} satellites`}
        </div>
        {dataSource && (
          <div style={{ fontSize: 10, opacity: 0.35, marginTop: 4, color: '#8cf' }}>source: {dataSource}</div>
        )}
        {fetchError && (
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 8, color: '#f88', maxWidth: 280 }}>{fetchError}</div>
        )}
      </div>

      <div
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 15,
          display: 'flex',
          flexDirection: 'row-reverse',
          alignItems: 'center',
          width: panelOpen ? 302 : 22,
          overflow: 'hidden',
          transition: 'width 0.3s ease',
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          aria-label={panelOpen ? 'Hide inclination panel' : 'Show inclination panel'}
          onClick={() => setPanelOpen((o) => !o)}
          style={{
            width: 22,
            height: 56,
            borderRadius: '8px 0 0 8px',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRight: 'none',
            background: 'rgba(5,10,20,0.92)',
            color: 'rgba(255,255,255,0.75)',
            cursor: 'pointer',
            fontSize: 14,
            flexShrink: 0,
          }}
        >
          {panelOpen ? '›' : '‹'}
        </button>

        <div
          style={{
            width: 280,
            flexShrink: 0,
            background: 'rgba(5,10,20,0.88)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRight: 'none',
            borderRadius: '12px 0 0 12px',
            padding: '18px 16px 14px',
            color: '#fff',
            fontFamily: 'ui-monospace, monospace',
            backdropFilter: 'blur(12px)',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12, opacity: 0.92, letterSpacing: 1.2 }}>
            {currentMode.label}
          </div>

          {currentMode.legend.map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: item.c,
                  flexShrink: 0,
                  boxShadow: `0 0 8px ${item.c}`,
                }}
              />
              <span style={{ fontSize: 12, opacity: 0.88 }}>{item.label}</span>
              <span style={{ fontSize: 10, opacity: 0.45, marginLeft: 'auto' }}>{item.range}</span>
            </div>
          ))}

          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              marginTop: 12,
              paddingTop: 12,
            }}
          >
            <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 8 }}>Distribution</div>
            {bucketRows.map((row) => (
              <div
                key={row.key}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  opacity: 0.82,
                  marginBottom: 4,
                }}
              >
                <span>{row.label}</span>
                <span>
                  {row.n.toLocaleString()} ({hist.pct(row.n)}%)
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              marginTop: 12,
              paddingTop: 12,
            }}
          >
            <div style={{ fontSize: 10, opacity: 0.45, marginBottom: 8 }}>COLOR MODE</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {Object.entries(MODES).map(([key, val]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleModeChange(key)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${mode === key ? 'rgba(100,150,255,0.55)' : 'rgba(255,255,255,0.1)'}`,
                    background: mode === key ? 'rgba(100,150,255,0.18)' : 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 11,
                    textAlign: 'left',
                  }}
                >
                  {val.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14, opacity: 0.5 }}>
            <span style={{ cursor: 'default' }}>◀</span>
            <span style={{ cursor: 'default' }}>☰</span>
            <span style={{ cursor: 'default' }}>▶</span>
          </div>
        </div>
      </div>

      <footer
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '10px 16px 12px',
          background: 'linear-gradient(0deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 70%, transparent 100%)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {['⌂', '🌐', '🗺', '☁', '⚙'].map((icon, i) => (
            <button
              key={i}
              type="button"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              {icon}
            </button>
          ))}
        </div>

        <div
          style={{
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            flex: 1,
            minWidth: 200,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
            <span>Clouds {cloudsOn ? 'ON' : 'OFF'}</span>
            <span>{fps} FPS</span>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 12,
              maxWidth: 640,
            }}
          >
            {MODES.inclination.legend.map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: item.c,
                    boxShadow: `0 0 6px ${item.c}`,
                  }}
                />
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'system-ui, sans-serif' }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            color: 'rgba(255,255,255,0.75)',
          }}
        >
          <span>{utcStr}</span>
          <button
            type="button"
            onClick={() => stepSim(-60 * 60 * 1000)}
            style={btnPlayback}
            title="Back 1h"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={() =>
              setAnimPaused((p) => {
                if (p) simTimeRef.current = new Date()
                return !p
              })
            }
            style={btnPlayback}
            title={animPaused ? 'Play (live)' : 'Pause'}
          >
            {animPaused ? '▶' : '⏸'}
          </button>
          <button
            type="button"
            onClick={() => stepSim(60 * 60 * 1000)}
            style={btnPlayback}
            title="Forward 1h"
          >
            ⏭
          </button>
          <button type="button" onClick={() => fetchTLEs()} style={btnPlayback} title="Refresh TLEs">
            ↻
          </button>
        </div>
      </footer>

      {selected && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(5,10,20,0.95)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 10,
            padding: '20px 24px',
            color: 'white',
            fontFamily: 'ui-monospace, monospace',
            minWidth: 260,
            backdropFilter: 'blur(20px)',
            zIndex: 100,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 'bold' }}>🛰 {selected.name}</div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: 16,
                opacity: 0.6,
              }}
            >
              ✕
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 2 }}>
            <div>Lat: {selected.lat?.toFixed(2)}°</div>
            <div>Lng: {selected.lng?.toFixed(2)}°</div>
            <div>Altitude: {selected.altKm} km</div>
            <div>Inclination: {selected.inclination}°</div>
          </div>
        </div>
      )}
    </div>
  )
}
