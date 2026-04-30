'use client'

import { useEffect, useRef } from 'react'
import GlobeGL, { type GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import axios from 'axios'
import type { TleRecord, SatellitePoint, TelemetryPayload } from '@/app/lib/types'
import { COUNTRIES_GEO_URL, EARTH_BUMP, EARTH_DAY, EARTH_NIGHT, STARFIELD } from '@/app/lib/constants'
import { buildTelemetry } from '@/app/lib/satelliteUtils'
import { noradFromLine1 } from '@/app/lib/tleParser'
import { filterTlesByMenu, type MenuFilter } from '@/app/lib/satelliteFilters'
import { sampleGroundTrackRing } from '@/app/lib/orbitMath'
import type { GlobeApi } from './types'

type WorkerResponse = {
  timestamp: number
  count: number
  payload: Float32Array
  norads: Uint32Array
  names: string[]
  colors: string[]
}

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
  vizMode?: number
  menuFilter?: MenuFilter | null
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
    vizMode = 0,
    menuFilter = null,
  } = props

  const vizModeRef = useRef(vizMode)
  const menuFilterRef = useRef<MenuFilter | null>(menuFilter)
  vizModeRef.current = vizMode
  menuFilterRef.current = menuFilter

  const workerRef = useRef<Worker | null>(null)
  const propagateRef = useRef<() => void>(() => {})

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

    const worker = new Worker('/tleWorker.js')
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { timestamp, count, payload, norads, names, colors } = e.data
      const pts: SatellitePoint[] = []
      for (let i = 0; i < count; i++) {
        const base = i * 5
        pts.push({
          norad: norads[i],
          name: names[i],
          lat: payload[base],
          lng: payload[base + 1],
          alt: payload[base + 2],
          altKm: payload[base + 3],
          inclination: payload[base + 4],
          baseColor: colors[i],
        })
      }
      pointsRef.current = pts
      onPointsUpdateRef.current(pts)
      onTelemetryRef.current(buildTelemetry(pts, tlesRef.current))
      onUtcRef.current(formatUtc(new Date(timestamp)))
      pushPointsRef.current()
    }

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
      .customLayerData([])
      .customThreeObject(() => {
        const geo = new THREE.SphereGeometry(0.42, 4, 4)
        const mat = new THREE.MeshBasicMaterial({ color: '#ff8c00' })
        return new THREE.Mesh(geo, mat)
      })
      .customThreeObjectUpdate((obj: any, d: any) => {
        // PERFORMANCE FIX:
        // Use the precomputed color on the data object (d.color) and only update
        // the material color when it actually changed. Also only update selection
        // related scale when selection state changes.
        //
        // This avoids calling material.color.set(...) every frame for thousands of objects,
        // which was causing GC and GPU upload stalls when colors were enabled.

        // Determine desired color (data already carries color from pushPointsToGlobe)
        const desiredColor = d._selected ? '#ffffff' : (d.color ?? '#ffffff')

        // Use obj.userData to cache last-applied color and selection state
        const ud = obj.userData || (obj.userData = {})

        // Only update material color if it changed
        if (ud._lastColor !== desiredColor) {
          // set color once when changed
          try {
            obj.material.color.set(desiredColor)
          } catch (e) {
            // fallback: ignore if material not ready
          }
          ud._lastColor = desiredColor
        }

        // Only update scale when selection state changes
        if (ud._lastSelected !== !!d._selected) {
          obj.scale.setScalar(d._selected ? 1.5 : 1)
          ud._lastSelected = !!d._selected
        }

        // Update position every frame (cheap)
        // globe.getCoords may return either an array [x,y,z] or an object { x, y, z } depending on globe.gl version.
        const coords: any = globe.getCoords(d.lat, d.lng, d.alt)
        if (Array.isArray(coords)) {
          obj.position.set(coords[0], coords[1], coords[2])
        } else if (coords && typeof coords === 'object') {
          // handle { x, y, z } or { lat, lng, alt } shapes
          const x = (coords.x ?? (coords as any)[0] ?? coords.lat ?? 0) as number
          const y = (coords.y ?? (coords as any)[1] ?? coords.lng ?? 0) as number
          const z = (coords.z ?? (coords as any)[2] ?? coords.alt ?? 0) as number
          obj.position.set(x, y, z)
        } else {
          // fallback: no-op
        }
      })
    globe.pointOfView({ altitude: 2.25 })
    globe.controls().autoRotate = true
    globe.controls().autoRotateSpeed = 0.28

    const hemi = new THREE.HemisphereLight(0xffffff, 0x151528, 1.4)
    globe.scene().add(hemi)
    hemiRef.current = hemi

    try {
      const renderer = globe.renderer()
      if (renderer) renderer.toneMappingExposure = 1.6
    } catch (e) {}

    async function loadBorders() {
      try {
        const res = await axios.get(COUNTRIES_GEO_URL)
        borderPathsRef.current = countryOutlinesToPaths(res.data)
      } catch (e) {
        borderPathsRef.current = []
      }
    }
    loadBorders()

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

      // Update colors in place for selection changes to avoid recreating objects
      for (const p of pts) {
        p.color = sel.has(p.norad) ? '#ffffff' : p.baseColor
        p._selected = sel.has(p.norad)
      }

      // Provide the updated data to globe.gl (same array reference to avoid recreation)
      globe.customLayerData(pts)

      // Labels: only compute a sparse set when zoomed in
      const pov = globe.pointOfView()
      const zoomed = pov.altitude < 0.38
      if (zoomed && pts.length) {
        const maxLab = 72
        const step = Math.max(1, Math.ceil(pts.length / maxLab))
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

    // --- Propagation function and plumbing ---
    function propagate() {
      const tles = tlesRef.current
      if (!tles.length || !workerRef.current) return
      const filtered = filterTlesByMenu(tles, menuFilterRef.current)
      workerRef.current.postMessage({ tles: filtered, timestamp: simTimeRef.current.getTime(), vizMode: vizModeRef.current })
    }
    propagateRef.current = propagate

    // Load TLEs and wire up periodic refresh
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

    globe.onCustomLayerClick((d: any) => {
      const next = new Set(selectedRef.current)
      if (next.has(d.norad)) next.delete(d.norad)
      else next.add(d.norad)
      selectedRef.current = next
      onSelectionChangeRef.current(next)
      pushPointsRef.current()
    })

    const onResize = () => {
      globe.width(window.innerWidth)
      globe.height(window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    const api = {
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
      // Provide a small helper to read sim time. Cast to match expected GlobeApi when exposing.
      getSimTime: () => simTimeRef.current,
    }

    // Cast to GlobeApi to satisfy TypeScript if GlobeApi doesn't include getSimTime.
    onReadyRef.current(api as unknown as GlobeApi)

    let raf = 0
    const loop = () => {
      const wall = performance.now()
      const dt = wall - lastWallRef.current
      lastWallRef.current = wall

      if (!uiRef.current.animPaused) {
        simTimeRef.current = new Date(simTimeRef.current.getTime() + dt * speedRef.current)
      }

      const sp = speedRef.current
      const minStep = sp >= 10 ? 200 : sp >= 5 ? 400 : sp >= 2 ? 800 : 2000

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
      workerRef.current?.terminate()
      try {
        globeRef.current?.renderer()?.dispose()
      } catch (e) {}
      globeRef.current = null
      hemiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  useEffect(() => {
    propagateRef.current()
  }, [menuFilter])

  useEffect(() => {
    pushPointsRef.current()
  }, [vizMode])

  return <div ref={rootRef} className="absolute inset-0" />
}
