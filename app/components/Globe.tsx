'use client'

import { useEffect, useRef } from 'react'
import GlobeGL, { type GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import axios from 'axios'
import type { TleRecord, SatellitePoint, TelemetryPayload } from '@/app/lib/types'
import { COUNTRIES_GEO_URL, EARTH_BUMP, EARTH_DAY, EARTH_NIGHT, STARFIELD } from '@/app/lib/constants'
import { propagateAll, buildTelemetry, hardwareBucket, inclinationColor } from '@/app/lib/satelliteUtils'
import { noradFromLine1 } from '@/app/lib/tleParser'
import { sampleGroundTrackRing } from '@/app/lib/orbitMath'
import type { GlobeApi } from './types'

function countryOutlinesToPaths(geojson: any, alt = 0.0028): [number, number, number][][] {
  const paths: [number, number, number][][] = []
  for (const f of geojson.features ?? []) {
    const p = f.properties
    if (p?.ISO_A2 === 'AQ') continue
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') {
      const ring = g.coordinates[0]
      if (ring?.length) paths.push(ring.map(([lng, lat]: number[]) => [lat, lng, alt]))
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        const ring = poly[0]
        if (ring?.length) paths.push(ring.map(([lng, lat]: number[]) => [lat, lng, alt]))
      }
    }
  }
  return paths
}

type Props = {
  onReady: (api: GlobeApi) => void
  onTelemetry: (t: TelemetryPayload) => void
  onTleLoaded: (tles: TleRecord[]) => void
  selected: Set<number>
  onSelectionChange: (next: Set<number>) => void
  onPointsUpdate: (pts: SatellitePoint[]) => void
  ui: {
    bordersOn: boolean
    graticulesOn: boolean
    starfieldOn: boolean
    dayTexture: boolean
    orbitTrails: boolean
    cloudsOn: boolean
    terminatorOn: boolean
    animPaused: boolean
  }
  onUtc: (s: string) => void
}

function formatUtc(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${String(d.getUTCFullYear()).slice(2)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`
}

export default function GlobeView(props: Partial<Props> = {}) {
  const {
    onReady = () => {},
    onTelemetry = () => {},
    onTleLoaded = () => {},
    selected = new Set<number>(),
    onSelectionChange = () => {},
    onPointsUpdate = () => {},
    ui = {
      bordersOn: true,
      graticulesOn: true,
      starfieldOn: true,
      dayTexture: true,
      orbitTrails: false,
      cloudsOn: false,
      terminatorOn: false,
      animPaused: false,
    },
    onUtc = () => {},
  } = props

  const rootRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  const hemiRef = useRef<THREE.HemisphereLight | null>(null)
  const rebuildPathsRef = useRef<() => void>(() => {})
  const pushPointsRef = useRef<() => void>(() => {})
  const speedRef = useRef(1)

  const onTelemetryRef = useRef(onTelemetry)
  const onTleLoadedRef = useRef(onTleLoaded)
  const onPointsUpdateRef = useRef(onPointsUpdate)
  const onUtcRef = useRef(onUtc)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const onReadyRef = useRef(onReady)
  const uiRef = useRef(ui)
  const selectedRef = useRef(selected)

  onTelemetryRef.current = onTelemetry
  onTleLoadedRef.current = onTleLoaded
  onPointsUpdateRef.current = onPointsUpdate
  onUtcRef.current = onUtc
  onSelectionChangeRef.current = onSelectionChange
  onReadyRef.current = onReady
  uiRef.current = ui
  selectedRef.current = selected

  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const globe = new (GlobeGL as any)(el) as GlobeInstance
    globeRef.current = globe

    const tlesRef: { current: TleRecord[] } = { current: [] }
    const tleByNoradRef = { current: new Map<number, TleRecord>() }
    const pointsRef: { current: SatellitePoint[] } = { current: [] }
    const borderPathsRef: { current: [number, number, number][][] } = { current: [] }
    const simTimeRef = { current: new Date() }
    const lastWallRef = { current: performance.now() }
    const lastPropRef = { current: performance.now() }

    globe
      .globeImageUrl(EARTH_DAY)
      .bumpImageUrl(EARTH_BUMP)
      .backgroundImageUrl(STARFIELD)
      .backgroundColor('#020208')
      .showGraticules(true)
      .showAtmosphere(true)
      .atmosphereColor('#9ed0ff')
      .atmosphereAltitude(0.26)
      .width(window.innerWidth)
      .height(window.innerHeight)
      // ── Use customLayerData with SphereGeometry so satellites render as DOTS not bars ──
      .customLayerData([])
      .customThreeObject((d: any) => {
        const geo = new THREE.SphereGeometry(0.9, 6, 6)
        const mat = new THREE.MeshBasicMaterial({ color: d.color || '#ff8c00' })
        return new THREE.Mesh(geo, mat)
      })
      .customThreeObjectUpdate((obj: any, d: any) => {
        obj.material.color.set(d.color || '#ff8c00')
        Object.assign(obj.position, globe.getCoords(d.lat, d.lng, d.alt))
      })

    globe.pointOfView({ altitude: 2.25 })
    globe.controls().autoRotate = true
    globe.controls().autoRotateSpeed = 0.28

    const hemi = new THREE.HemisphereLight(0xffffff, 0x151528, 1.4)
    globe.scene().add(hemi)
    hemiRef.current = hemi

    // Boost brightness
    try {
      const renderer = globe.renderer()
      if (renderer) renderer.toneMappingExposure = 1.6
    } catch (e) {}

    function rebuildPaths() {
      const border = uiRef.current.bordersOn ? borderPathsRef.current : []
      const orbit: { points: [number, number, number][]; color: string }[] = []
      if (uiRef.current.orbitTrails) {
        for (const id of selectedRef.current) {
          const tle = tleByNoradRef.current.get(id)
          if (!tle) continue
          const ring = sampleGroundTrackRing(tle, simTimeRef.current, 96)
          if (ring.length > 4) orbit.push({ points: ring, color: 'rgba(255,165,70,0.9)' })
        }
      }
      const merged = [
        ...border.map((points) => ({ points, color: 'rgba(255,255,255,0.4)' })),
        ...orbit,
      ]
      globe
        .pathsData(merged)
        .pathPoints('points')
        .pathColor((d: any) => d.color)
        .pathStroke(0.28)
    }
    rebuildPathsRef.current = rebuildPaths

    function pushPointsToGlobe() {
      const pts = pointsRef.current
      const sel = selectedRef.current

      // Color satellites based on current mode (inclination by default)
      const colored = pts.map(p => ({
        ...p,
        color: sel.has(p.norad) ? '#ffffff' : p.color,
        // Make selected satellites bigger via a flag
        _selected: sel.has(p.norad),
      }))

      globe
        .customLayerData(colored)
        .customThreeObject((d: any) => {
          const size = d._selected ? 1.4 : 0.9
          const geo = new THREE.SphereGeometry(size, 6, 6)
          const mat = new THREE.MeshBasicMaterial({ color: d.color || '#ff8c00' })
          return new THREE.Mesh(geo, mat)
        })
        .customThreeObjectUpdate((obj: any, d: any) => {
          obj.material.color.set(d.color || '#ff8c00')
          Object.assign(obj.position, globe.getCoords(d.lat, d.lng, d.alt))
        })

      // Labels when zoomed in
      const pov = globe.pointOfView()
      const zoomed = pov.altitude < 0.38
      if (zoomed && pts.length) {
        const step = Math.max(1, Math.ceil(pts.length / 85))
        const lab = pts
          .filter((_, i) => i % step === 0)
          .map((p) => ({
            lat: p.lat,
            lng: p.lng,
            alt: p.alt,
            text: `${p.name}`,
            color: 'rgba(255,255,255,0.96)',
            size: 0.011,
          }))
        globe
          .labelsData(lab)
          .labelText('text')
          .labelColor('color')
          .labelAltitude('alt')
          .labelSize('size')
          .labelDotRadius(0.032)
      } else {
        globe.labelsData([])
      }

      rebuildPaths()
    }
    pushPointsRef.current = pushPointsToGlobe

    function propagate() {
      const tles = tlesRef.current
      if (!tles.length) return
      const pts = propagateAll(tles, simTimeRef.current)
      pointsRef.current = pts
      onPointsUpdateRef.current(pts)
      onTelemetryRef.current(buildTelemetry(pts, tles))
      onUtcRef.current(formatUtc(simTimeRef.current))
      pushPointsToGlobe()
    }

    fetch(COUNTRIES_GEO_URL)
      .then((r) => r.json())
      .then((geo: any) => {
        borderPathsRef.current = countryOutlinesToPaths(geo)
        rebuildPaths()
      })
      .catch(() => {})

    async function loadTle() {
      try {
        const res = await axios.get<TleRecord[]>('/api/tle')
        tlesRef.current = res.data
        const m = new Map<number, TleRecord>()
        for (const t of res.data) {
          m.set(noradFromLine1(t.TLE_LINE1), t)
        }
        tleByNoradRef.current = m
        onTleLoadedRef.current(res.data)
        propagate()
        console.log('Loaded satellites:', res.data.length)
      } catch (e) {
        console.error('TLE load failed:', e)
      }
    }

    void loadTle()
    const tleIv = setInterval(() => void loadTle(), 50 * 60 * 1000)

    // Click to select/deselect satellite
    globe.onCustomLayerClick((d: any) => {
      const next = new Set(selectedRef.current)
      if (next.has(d.norad)) next.delete(d.norad)
      else next.add(d.norad)
      selectedRef.current = next
      onSelectionChangeRef.current(next)
      pushPointsToGlobe()
    })

    const onResize = () => {
      globe.width(window.innerWidth)
      globe.height(window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    const api: GlobeApi = {
      resetView: () => {
        globe.pointOfView({ altitude: 2.25 })
        globe.controls().autoRotate = !uiRef.current.animPaused
      },
      focusOn: (lat: number, lng: number, alt = 0.14) => {
        globe.pointOfView({ lat, lng, altitude: alt })
        globe.controls().autoRotate = false
      },
      setBorders: () => {},
      setGraticules: () => {},
      setStarfield: () => {},
      setDayTexture: () => {},
      setClouds: () => {},
      setOrbitTrails: () => {},
      setTerminator: () => {},
      togglePause: () => {},
      setTimeSpeed: (n: number) => { speedRef.current = n },
      stepTime: (deltaMs: number) => {
        simTimeRef.current = new Date(simTimeRef.current.getTime() + deltaMs)
        propagate()
      },
      refreshTle: () => void loadTle(),
      jumpToNow: () => {
        simTimeRef.current = new Date()
        lastWallRef.current = performance.now()
        propagate()
      },
    }

    onReadyRef.current(api)

    let raf = 0
    const loop = () => {
      const wall = performance.now()
      const dt = wall - lastWallRef.current
      lastWallRef.current = wall

      if (!uiRef.current.animPaused) {
        simTimeRef.current = new Date(simTimeRef.current.getTime() + dt * speedRef.current)
      }

      const sp = speedRef.current
      const minStep = sp >= 10 ? 40 : sp >= 5 ? 55 : sp >= 2 ? 90 : 1000

      if (wall - lastPropRef.current >= minStep && tlesRef.current.length) {
        lastPropRef.current = wall
        propagate()
      } else {
        onUtcRef.current(formatUtc(simTimeRef.current))
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(tleIv)
      window.removeEventListener('resize', onResize)
      globeRef.current = null
      hemiRef.current = null
    }
  }, [])

  useEffect(() => {
    uiRef.current = ui
    const globe = globeRef.current
    const hemi = hemiRef.current
    if (!globe) return
    globe.showGraticules(ui.graticulesOn)
    globe.globeImageUrl(ui.dayTexture ? EARTH_DAY : EARTH_NIGHT)
    globe.backgroundImageUrl(ui.starfieldOn ? STARFIELD : '')
    if (hemi) hemi.intensity = ui.terminatorOn ? 1.25 : 1.4
    globe.controls().autoRotate = !ui.animPaused
    rebuildPathsRef.current()
  }, [ui.graticulesOn, ui.starfieldOn, ui.dayTexture, ui.bordersOn, ui.orbitTrails, ui.terminatorOn, ui.animPaused])

  useEffect(() => {
    selectedRef.current = selected
    pushPointsRef.current()
  }, [selected])

  return <div ref={rootRef} className="absolute inset-0" />
}