import { useEffect, useRef, useState } from 'react'
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

export default function GlobeView() {
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const tleRef = useRef([])
  const posRef = useRef([])
  const [count, setCount] = useState(0)
  const [mode, setMode] = useState('inclination')
  const [utc, setUtc] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  // UTC clock
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date()
      const d = n.toISOString().replace('T', ' ').slice(0, 19)
      setUtc(d + ' UTC')
    }, 1000)
    return () => clearInterval(t)
  }, [])

  async function fetchTLEs() {
    try {
      const res = await axios.get('/api/satellites')
      tleRef.current = res.data
      setCount(res.data.length)
      setLoading(false)
      console.log('Loaded satellites:', res.data.length)
    } catch (e) {
      console.error('Fetch failed', e)
      setLoading(false)
    }
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
      .customLayerData([])
      .customThreeObject((d) => {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.7, 6, 6),
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
    globe.controls().autoRotateSpeed = 0.3
    globe.pointOfView({ altitude: 2.5 })

    window.addEventListener('resize', () => {
      globe.width(window.innerWidth)
      globe.height(window.innerHeight)
    })

    fetchTLEs().then(() => {
      setInterval(() => {
        if (!tleRef.current.length) return
        const positions = calculatePositions(tleRef.current)
        posRef.current = positions
        const currentMode = document.getElementById('colorMode')?.value || 'inclination'
        const colored = positions.map(p => ({
          ...p,
          color: MODES[currentMode]?.color(p) || '#ff8c00'
        }))
        globeRef.current?.customLayerData(colored)
      }, 1000)
    })

    setInterval(fetchTLEs, 30 * 60 * 1000)
  }, [])

  // Update colors when mode changes
  const handleModeChange = (newMode) => {
    setMode(newMode)
    if (!posRef.current.length) return
    const colored = posRef.current.map(p => ({
      ...p,
      color: MODES[newMode].color(p)
    }))
    globeRef.current?.customLayerData(colored)
  }

  const currentMode = MODES[mode]

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
      
      {/* Hidden input to track mode for interval */}
      <input type="hidden" id="colorMode" value={mode} />

      <div ref={containerRef} />

      {/* Top Left - Title */}
      <div style={{
        position: 'fixed', top: 24, left: 24,
        color: 'white', fontFamily: 'sans-serif', pointerEvents: 'none'
      }}>
        <div style={{ fontSize: 36, fontWeight: 900, opacity: 0.25, letterSpacing: 3, textTransform: 'lowercase' }}>
          satellite tracker
        </div>
        <div style={{ fontSize: 13, opacity: 0.6, marginTop: 2 }}>
          {loading ? '⏳ Loading satellite data...' : `${count.toLocaleString()} satellites`}
        </div>
      </div>

      {/* Right Panel */}
      <div style={{
        position: 'fixed', right: 0, top: '50%',
        transform: 'translateY(-50%)',
        background: 'rgba(5,10,20,0.85)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRight: 'none',
        borderRadius: '10px 0 0 10px',
        padding: '18px 16px',
        color: 'white', fontFamily: 'monospace',
        minWidth: 230, backdropFilter: 'blur(10px)',
      }}>
        {/* Mode title */}
        <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 14, opacity: 0.9, letterSpacing: 1 }}>
          {currentMode.label}
        </div>

        {/* Legend */}
        {currentMode.legend.map(item => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7
          }}>
            <div style={{
              width: 11, height: 11, borderRadius: '50%',
              background: item.c, flexShrink: 0, boxShadow: `0 0 6px ${item.c}`
            }} />
            <span style={{ fontSize: 12, opacity: 0.85 }}>{item.label}</span>
            <span style={{ fontSize: 10, opacity: 0.4, marginLeft: 'auto' }}>{item.range}</span>
          </div>
        ))}

        {/* Distribution */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          marginTop: 12, paddingTop: 12
        }}>
          <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 6 }}>
            Distribution ({count.toLocaleString()} satellites)
          </div>
        </div>

        {/* Mode Switcher */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          marginTop: 10, paddingTop: 10
        }}>
          <div style={{ fontSize: 10, opacity: 0.4, marginBottom: 7 }}>COLOR MODE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {Object.entries(MODES).map(([key, val]) => (
              <button key={key} onClick={() => handleModeChange(key)} style={{
                padding: '5px 10px', borderRadius: 5,
                border: `1px solid ${mode === key ? 'rgba(100,150,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                background: mode === key ? 'rgba(100,150,255,0.2)' : 'transparent',
                color: 'white', cursor: 'pointer', fontSize: 11,
                textAlign: 'left', transition: 'all 0.2s'
              }}>
                {val.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom UTC Clock */}
      <div style={{
        position: 'fixed', bottom: 16, right: 16,
        color: 'rgba(255,255,255,0.45)',
        fontSize: 12, fontFamily: 'monospace',
        letterSpacing: 1,
      }}>
        {utc}
      </div>

      {/* Bottom Left - FPS indicator placeholder */}
      <div style={{
        position: 'fixed', bottom: 16, left: 24,
        color: 'rgba(255,255,255,0.3)',
        fontSize: 11, fontFamily: 'monospace',
      }}>
        LIVE · updates every 1s
      </div>

      {/* Selected Satellite Popup */}
      {selected && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(5,10,20,0.95)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10, padding: '20px 24px',
          color: 'white', fontFamily: 'monospace',
          minWidth: 260, backdropFilter: 'blur(20px)',
          zIndex: 100,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 'bold' }}>🛰️ {selected.name}</div>
            <button onClick={() => setSelected(null)} style={{
              background: 'none', border: 'none', color: 'white',
              cursor: 'pointer', fontSize: 16, opacity: 0.6
            }}>✕</button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 2 }}>
            <div>📍 Lat: {selected.lat?.toFixed(2)}°</div>
            <div>📍 Lng: {selected.lng?.toFixed(2)}°</div>
            <div>🌐 Altitude: {selected.altKm} km</div>
            <div>📐 Inclination: {selected.inclination}°</div>
          </div>
        </div>
      )}
    </div>
  )
}