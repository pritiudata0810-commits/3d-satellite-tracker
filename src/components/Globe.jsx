import { useEffect, useRef, useState, useCallback } from 'react'
import Globe from 'globe.gl'
import axios from 'axios'
import * as THREE from 'three'
import { calculatePositions } from '../engine/orbitEngine'

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
      if (s.altKm < 400) return '#e63946'
      if (s.altKm < 1000) return '#ff8c00'
      if (s.altKm < 2000) return '#ffd700'
      if (s.altKm < 35786) return '#2ecc40'
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
}

const TOOLBAR = [
  { id: 'rotate', icon: '🔄', label: 'Rotation', options: ['Auto', 'Off'] },
  { id: 'borders', icon: '🗺️', label: 'Borders', options: ['On', 'Off'] },
  { id: 'grid', icon: '⊞', label: 'Grid', options: ['On', 'Off'] },
  { id: 'atmo', icon: '🌫️', label: 'Atmosphere', options: ['On', 'Off'] },
  { id: 'fps', icon: '🎬', label: 'FPS', options: ['60', '30'] },
  { id: 'labels', icon: '🏷️', label: 'Labels', options: ['On', 'Off'] },
]

export default function GlobeView() {
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const tleRef = useRef([])
  const posRef = useRef([])
  const modeRef = useRef('inclination')
  const countriesRef = useRef([])
  const [count, setCount] = useState(0)
  const [mode, setMode] = useState('inclination')
  const [utc, setUtc] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [toolbar, setToolbar] = useState({
    rotate: 'Auto', borders: 'On', grid: 'On',
    atmo: 'On', fps: '60', labels: 'On'
  })
  const [fps, setFps] = useState(0)
  const fpsRef = useRef({ count: 0, last: Date.now() })

  useEffect(() => { modeRef.current = mode }, [mode])

  // UTC clock
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date()
      setUtc(n.toISOString().slice(0, 19).replace('T', ' ') + ' UTC')
    }, 1000)
    return () => clearInterval(t)
  }, [])

  async function fetchTLEs() {
    try {
      const res = await axios.get('/api/satellites')
      tleRef.current = res.data
      setCount(res.data.length)
      setLoading(false)
    } catch (e) {
      console.error('Fetch failed', e)
      setLoading(false)
    }
  }

  async function fetchCountries() {
    try {
      const res = await fetch(
        'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
      )
      const json = await res.json()
      countriesRef.current = json.features
      if (globeRef.current) {
        globeRef.current.polygonsData(json.features)
      }
    } catch (e) { console.error('Countries fetch failed', e) }
  }

  useEffect(() => {
    const globe = Globe()(containerRef.current)
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
      .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
      .width(window.innerWidth)
      .height(window.innerHeight)
      .showGraticules(true)
      .showAtmosphere(true)
      .atmosphereColor('#1a6cff')
      .atmosphereAltitude(0.15)
      // Country borders
      .polygonsData([])
      .polygonCapColor(() => 'rgba(0,0,0,0)')
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor(() => 'rgba(255,255,255,0.25)')
      .polygonAltitude(0.001)
      // Satellites
      .customLayerData([])
      .customThreeObject((d) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.6, 6, 6),
          new THREE.MeshBasicMaterial({ color: d.color || '#ff8c00' })
        )
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
    globe.controls().autoRotateSpeed = 0.3
    globe.pointOfView({ altitude: 2.5 })

    window.addEventListener('resize', () => {
      globe.width(window.innerWidth)
      globe.height(window.innerHeight)
    })

    // FPS counter
    const countFps = () => {
      fpsRef.current.count++
      const now = Date.now()
      if (now - fpsRef.current.last >= 1000) {
        setFps(fpsRef.current.count)
        fpsRef.current.count = 0
        fpsRef.current.last = now
      }
      requestAnimationFrame(countFps)
    }
    requestAnimationFrame(countFps)

    fetchCountries()

    fetchTLEs().then(() => {
      setInterval(() => {
        if (!tleRef.current.length) return
        const positions = calculatePositions(tleRef.current)
        posRef.current = positions
        const colored = positions.map(p => ({
          ...p,
          color: MODES[modeRef.current]?.color(p) || '#ff8c00'
        }))
        globeRef.current?.customLayerData(colored)
      }, 1000)
    })

    setInterval(fetchTLEs, 30 * 60 * 1000)
  }, [])

  const handleToolbar = (id, val) => {
    setToolbar(prev => ({ ...prev, [id]: val }))
    const g = globeRef.current
    if (!g) return
    if (id === 'rotate') {
      g.controls().autoRotate = val === 'Auto'
    }
    if (id === 'grid') g.showGraticules(val === 'On')
    if (id === 'atmo') g.showAtmosphere(val === 'On')
    if (id === 'borders') {
      g.polygonsData(val === 'On' ? countriesRef.current : [])
    }
  }

  const handleModeChange = (newMode) => {
    setMode(newMode)
    modeRef.current = newMode
    if (!posRef.current.length) return
    const colored = posRef.current.map(p => ({
      ...p,
      color: MODES[newMode].color(p)
    }))
    globeRef.current?.customLayerData(colored)
  }

  const currentLegend = MODES[mode]

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>

      <div ref={containerRef} />

      {/* Top Left Title */}
      <div style={{ position: 'fixed', top: 20, left: 24, pointerEvents: 'none' }}>
        <div style={{ fontSize: 38, fontWeight: 900, color: 'white', opacity: 0.2, letterSpacing: 2, textTransform: 'lowercase' }}>
          satellite tracker
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
          {loading ? '⏳ Loading...' : `${count.toLocaleString()} satellites`}
        </div>
      </div>

      {/* Right Legend Panel */}
      <div style={{
        position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)',
        background: 'rgba(5,10,20,0.88)', borderRadius: '12px 0 0 12px',
        border: '1px solid rgba(255,255,255,0.07)', borderRight: 'none',
        padding: '20px 18px', color: 'white', minWidth: 240,
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, letterSpacing: 0.5 }}>
          {currentLegend.label}
        </div>
        {currentLegend.legend.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              background: item.c, boxShadow: `0 0 7px ${item.c}88`, flexShrink: 0
            }} />
            <span style={{ fontSize: 12, opacity: 0.85 }}>{item.label}</span>
            <span style={{ fontSize: 10, opacity: 0.35, marginLeft: 'auto' }}>{item.range}</span>
          </div>
        ))}

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 14, paddingTop: 14 }}>
          <div style={{ fontSize: 10, opacity: 0.35, marginBottom: 8, letterSpacing: 1 }}>
            DISTRIBUTION ({count.toLocaleString()} satellites)
          </div>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 10, paddingTop: 12 }}>
          <div style={{ fontSize: 10, opacity: 0.35, marginBottom: 8, letterSpacing: 1 }}>COLOR MODE</div>
          {Object.entries(MODES).map(([key, val]) => (
            <button key={key} onClick={() => handleModeChange(key)} style={{
              width: '100%', marginBottom: 6, padding: '6px 10px',
              borderRadius: 6, cursor: 'pointer', fontSize: 11, textAlign: 'left',
              border: `1px solid ${mode === key ? 'rgba(100,160,255,0.5)' : 'rgba(255,255,255,0.07)'}`,
              background: mode === key ? 'rgba(100,160,255,0.18)' : 'transparent',
              color: 'white', transition: 'all 0.2s',
            }}>
              {val.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Toolbar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(5,10,20,0.85)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
        padding: '8px 0', gap: 4, flexWrap: 'wrap',
      }}>
        {TOOLBAR.map(btn => (
          <div key={btn.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 2px' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 3, letterSpacing: 0.5 }}>
              {btn.label}
            </div>
            <div style={{ display: 'flex', gap: 2 }}>
              {btn.options.map(opt => (
                <button key={opt} onClick={() => handleToolbar(btn.id, opt)} style={{
                  padding: '4px 9px', borderRadius: 5, cursor: 'pointer',
                  fontSize: 10, border: 'none', transition: 'all 0.2s',
                  background: toolbar[btn.id] === opt ? 'rgba(100,160,255,0.35)' : 'rgba(255,255,255,0.07)',
                  color: toolbar[btn.id] === opt ? 'white' : 'rgba(255,255,255,0.45)',
                  fontWeight: toolbar[btn.id] === opt ? 'bold' : 'normal',
                }}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* FPS display */}
        <div style={{
          position: 'absolute', right: 16,
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.07)', borderRadius: 6,
            padding: '4px 10px', fontSize: 11,
            color: fps >= 50 ? '#2ecc40' : fps >= 30 ? '#ffd700' : '#e63946',
            fontWeight: 'bold', fontFamily: 'monospace'
          }}>
            {fps} FPS
          </div>
        </div>

        {/* UTC Clock */}
        <div style={{
          position: 'absolute', left: 16,
          fontSize: 11, color: 'rgba(255,255,255,0.35)',
          fontFamily: 'monospace', letterSpacing: 0.5,
        }}>
          {utc}
        </div>
      </div>

      {/* Satellite Click Popup */}
      {selected && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(5,10,20,0.96)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12, padding: '22px 26px',
          color: 'white', fontFamily: 'monospace',
          minWidth: 280, backdropFilter: 'blur(20px)', zIndex: 100,
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 'bold' }}>🛰️ {selected.name}</div>
            <button onClick={() => setSelected(null)} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer', fontSize: 18
            }}>✕</button>
          </div>
          <div style={{ fontSize: 12, lineHeight: 2.2, opacity: 0.75 }}>
            <div>📍 Latitude: <b style={{ color: 'white' }}>{selected.lat?.toFixed(3)}°</b></div>
            <div>📍 Longitude: <b style={{ color: 'white' }}>{selected.lng?.toFixed(3)}°</b></div>
            <div>🌐 Altitude: <b style={{ color: '#ff8c00' }}>{selected.altKm} km</b></div>
            <div>📐 Inclination: <b style={{ color: '#ffd700' }}>{selected.inclination}°</b></div>
          </div>
        </div>
      )}
    </div>
  )
}