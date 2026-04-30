'use client'

import { useEffect, useRef } from 'react'
import GlobeGL, { type GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import axios from 'axios'
import type { TleRecord, SatellitePoint, TelemetryPayload } from '@/app/lib/types'
import {
  COUNTRIES_GEO_URL,
  EARTH_BUMP,
  EARTH_DAY,
  EARTH_NIGHT,
  STARFIELD,
} from '@/app/lib/constants'
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
  colors: number[]
}

function countryOutlinesToPaths(
  geojson: any,
  alt = 0.0028
): [number, number, number][][] {
  const paths: [number, number, number][][] = []

  for (const f of geojson.features ?? []) {
    const p = f.properties
    if (p?.ISO_A2 === 'AQ') continue

    const g = f.geometry
    if (!g) continue

    if (g.type === 'Polygon') {
      const ring = g.coordinates[0]
      if (ring?.length) {
        paths.push(ring.map(([lng, lat]: number[]) => [lat, lng, alt]))
      }
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates) {
        const ring = poly[0]
        if (ring?.length) {
          paths.push(ring.map(([lng, lat]: number[]) => [lat, lng, alt]))
        }
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
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${String(
    d.getUTCFullYear()
  ).slice(2)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(
    d.getUTCSeconds()
  )} UTC`
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

  const pointsRef = useRef<SatellitePoint[]>([])
  const tlesRef = useRef<TleRecord[]>([])
  const tleByNoradRef = useRef<Map<number, TleRecord>>(new Map())
  const simTimeRef = useRef<Date>(new Date())
  const lastWallRef = useRef<number>(0)
  const lastPropRef = useRef<number>(0)
  const borderPathsRef = useRef<[number, number, number][][]>([])

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

    lastWallRef.current = performance.now()
    lastPropRef.current = performance.now()

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
        const mat = new THREE.MeshBasicMaterial({ color: 0xff8c00 })
        return new THREE.Mesh(geo, mat)
      })
      .customThreeObjectUpdate((obj: any, d: any) => {
        const desiredColor =
          typeof d.color === 'number' ? d.color : 0xffffff

        const ud: any = obj.userData || (obj.userData = {})

        if (ud._lastColor !== desiredColor) {
          obj.material.color.setHex(desiredColor)
          ud._lastColor = desiredColor
        }

        const desiredScale = d._selected ? 1.5 : 1

        if (ud._lastScale !== desiredScale) {
          obj.scale.setScalar(desiredScale)
          ud._lastScale = desiredScale
        }

        const coords: any = globe.getCoords(d.lat, d.lng, d.alt)

        if (Array.isArray(coords)) {
          obj.position.set(coords[0], coords[1], coords[2])
        } else if (coords && typeof coords === 'object') {
          obj.position.set(
            coords.x ?? 0,
            coords.y ?? 0,
            coords.z ?? 0
          )
        }
      })

    globe.pointOfView({ altitude: 2.25 })
    globe.controls().autoRotate = true
    globe.controls().autoRotateSpeed = 0.28

    const hemi = new THREE.HemisphereLight(0xffffff, 0x151528, 1.4)
    globe.scene().add(hemi)
    hemiRef.current = hemi

    async function loadBorders() {
      try {
        const res = await axios.get(COUNTRIES_GEO_URL)
        borderPathsRef.current = countryOutlinesToPaths(res.data)
      } catch {
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

          if (ring.length > 4) {
            orbit.push({
              points: ring,
              color: 'rgba(255,165,70,0.9)',
            })
          }
        }
      }

      globe
        .pathsData([
          ...border.map((points) => ({
            points,
            color: 'rgba(255,255,255,0.4)',
          })),
          ...orbit,
        ])
        .pathPoints('points')
        .pathColor((d: any) => d.color)
        .pathStroke(0.28)
    }

    rebuildPathsRef.current = rebuildPaths

    // PERFORMANCE FIX: avoid mutating original objects each frame
    function pushPointsToGlobe() {
      const pts = pointsRef.current
      const sel = selectedRef.current

      const mapped = pts.map((p) => ({
        ...p,
        color: sel.has(p.norad) ? 0xffffff : p.baseColor,
        _selected: sel.has(p.norad),
      }))

      globe.customLayerData(mapped)

      rebuildPaths()
    }

    pushPointsRef.current = pushPointsToGlobe

    function propagate() {
      const tles = tlesRef.current
      if (!tles.length || !workerRef.current) return

      const filtered = filterTlesByMenu(tles, menuFilterRef.current)

      workerRef.current.postMessage({
        tles: filtered,
        timestamp: simTimeRef.current.getTime(),
        vizMode: vizModeRef.current,
      })
    }

    propagateRef.current = propagate

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
      } catch (e) {
        console.error(e)
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

    let raf = 0

    const loop = () => {
      const wall = performance.now()
      const dt = wall - lastWallRef.current
      lastWallRef.current = wall

      if (!uiRef.current.animPaused) {
        simTimeRef.current = new Date(
          simTimeRef.current.getTime() + dt * speedRef.current
        )
      }

      const sp = speedRef.current
      const minStep =
        sp >= 10 ? 200 : sp >= 5 ? 400 : sp >= 2 ? 800 : 2000

      if (wall - lastPropRef.current >= minStep && tlesRef.current.length) {
        lastPropRef.current = wall
        propagate()
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(tleIv)
      window.removeEventListener('resize', onResize)
      workerRef.current?.terminate()
      globeRef.current = null
      hemiRef.current = null
    }
  }, [])

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