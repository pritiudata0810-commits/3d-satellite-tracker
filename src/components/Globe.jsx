import { useEffect, useRef, useState } from 'react'
import Globe from 'globe.gl'
import axios from 'axios'
import { calculatePositions } from '../engine/orbitEngine'

export default function GlobeView() {
  const containerRef = useRef(null)
  const globeRef = useRef(null)
  const tleRef = useRef([])
  const [count, setCount] = useState(0)

  async function fetchTLEs() {
    try {
      const res = await axios.get('/api/satellites?group=starlink')
      tleRef.current = res.data
      setCount(res.data.length)
      console.log('Fetched satellites:', res.data.length)
    } catch (e) {
      console.error('TLE fetch failed', e)
    }
  }

  useEffect(() => {
    const globe = Globe()(containerRef.current)
      .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
      .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
      .width(window.innerWidth)
      .height(window.innerHeight)
      .pointsData([])
      .pointLat('lat')
      .pointLng('lng')
      .pointAltitude(0.01)
      .pointColor(() => 'orange')
      .pointRadius(0.15)
      .pointResolution(4)

    globeRef.current = globe
    globe.controls().autoRotate = true
    globe.controls().autoRotateSpeed = 0.3

    window.addEventListener('resize', () => {
      globe.width(window.innerWidth)
      globe.height(window.innerHeight)
    })

    fetchTLEs().then(() => {
      setInterval(() => {
        if (tleRef.current.length === 0) return
        const positions = calculatePositions(tleRef.current)
        globeRef.current.pointsData(positions)
      }, 1000)
    })

    setInterval(fetchTLEs, 30 * 60 * 1000)

  }, [])

  return (
    <>
      <div ref={containerRef} />
      <div style={{
        position: 'fixed', top: 20, left: 20,
        color: 'white', fontSize: '16px',
        background: 'rgba(0,0,0,0.6)',
        padding: '8px 14px', borderRadius: '8px'
      }}>
        🛰️ Tracking {count} Starlink satellites
      </div>
    </>
  )
}