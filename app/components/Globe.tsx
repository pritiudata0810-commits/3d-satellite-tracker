'use client'

import { useEffect, useRef } from 'react'
import GlobeGL, { type GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import axios from 'axios'
import type { TleRecord, SatellitePoint, TelemetryPayload } from '@/app/lib/types'
import { COUNTRIES_GEO_URL, EARTH_BUMP, EARTH_DAY, EARTH_NIGHT, STARFIELD } from '@/app/lib/constants'
import { propagateAll, buildTelemetry } from '@/app/lib/satelliteUtils'
import { noradFromLine1 } from '@/app/lib/tleParser'
import { filterTlesByMenu, type MenuFilter } from '@/app/lib/satelliteFilters'
import { pointVizColor } from '@/app/lib/vizColors'
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
  vizMode?: number
  menuFilter?: MenuFilter | null
}

function formatUtc(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${String(d.getUTCFullYear()).slice(2)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`
}

const PROPAGATION_INTERVAL_MS = 1000
const SATELLITE_SCALE = 0.04
const DEBUG_TIMING = false

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
  const updateTimestampRef = useRef<number>(Date.now())
  const instancedMeshRef = useRef<THREE.InstancedMesh | null>(null)
  const instanceColorAttrRef = useRef<THREE.InstancedBufferAttribute | null>(null)
  const instanceIdToNoradRef = useRef<number[]>([])
  const noradToInstanceIdRef = useRef<Map<number, number>>(new Map())
  const pointsRef = useRef<SatellitePoint[]>([])
  const tlesRef = useRef<TleRecord[]>([])
  const tleByNoradRef = useRef<Map<number, TleRecord>>(new Map())
  const workerRef = useRef<Worker | null>(null)
  const simTimeRef = useRef(new Date())

  vizModeRef.current = vizMode
  menuFilterRef.current = menuFilter
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

    const borderPathsRef = { current: [] as [number, number, number][][] }
    const tempMat = new THREE.Matrix4()
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const scene = globe.scene()
    const lastFrameRef = { current: performance.now() }

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
      .customThreeObject(() => new THREE.Object3D())
      .customThreeObjectUpdate(() => {})

    globe.pointOfView({ altitude: 2.25 })
    globe.controls().autoRotate = true
    globe.controls().autoRotateSpeed = 0.28

    const hemi = new THREE.HemisphereLight(0xffffff, 0x151528, 1.4)
    scene.add(hemi)
    hemiRef.current = hemi

    try {
      const renderer = globe.renderer()
      if (renderer) renderer.toneMappingExposure = 1.6
    } catch {
      // ignore
    }

    function createSatelliteMesh(capacity: number) {
      const geometry = new THREE.SphereGeometry(0.75, 6, 6)
      const material = new THREE.MeshBasicMaterial({ vertexColors: true })
      const mesh = new THREE.InstancedMesh(geometry, material, capacity)
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.frustumCulled = false
      const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
      colorAttr.setUsage(THREE.DynamicDrawUsage)
      mesh.instanceColor = colorAttr
      scene.add(mesh)
      instancedMeshRef.current = mesh
      instanceColorAttrRef.current = colorAttr
      return mesh
    }

    function disposeOldSatelliteMesh() {
      const mesh = instancedMeshRef.current
      if (!mesh) return
      mesh.geometry.dispose()
      if (Array.isArray(mesh.material)) mesh.material.forEach((mat) => mat.dispose())
      else mesh.material.dispose()
      scene.remove(mesh)
      instancedMeshRef.current = null
      instanceColorAttrRef.current = null
      instanceIdToNoradRef.current = []
      noradToInstanceIdRef.current.clear()
    }

    function buildSatelliteMesh(capacity: number) {
      disposeOldSatelliteMesh()
      createSatelliteMesh(capacity)
    }

    function hexToRgb(hex: string): [number, number, number] {
      const sanitized = hex.replace('#', '')
      const bigint = parseInt(sanitized, 16)
      return [((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255]
    }

    function updateInstanceBuffers(updatedPoints: SatellitePoint[]) {
      const mesh = instancedMeshRef.current
      const colorAttr = instanceColorAttrRef.current
      if (!mesh || !colorAttr) return

      const selected = selectedRef.current
      const count = updatedPoints.length
      const colors = colorAttr.array as Float32Array
      instanceIdToNoradRef.current = updatedPoints.map((point) => point.norad)
      noradToInstanceIdRef.current = new Map(updatedPoints.map((point, index) => [point.norad, index]))

      for (let index = 0; index < count; index++) {
        const point = updatedPoints[index]
        const { x, y, z } = globe.getCoords(point.lat, point.lng, point.alt)
        tempMat.identity()
        tempMat.setPosition(x, y, z)
        const scaleVal = selected.has(point.norad) ? 1.45 : 1
        tempMat.scale(new THREE.Vector3(scaleVal * SATELLITE_SCALE, scaleVal * SATELLITE_SCALE, scaleVal * SATELLITE_SCALE))
        mesh.setMatrixAt(index, tempMat)

        const [r, g, b] = selected.has(point.norad) ? [1, 1, 1] : hexToRgb(point.color)
        colors[index * 3] = r
        colors[index * 3 + 1] = g
        colors[index * 3 + 2] = b
      }

      mesh.count = count
      mesh.instanceMatrix.needsUpdate = true
      colorAttr.needsUpdate = true
    }

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

    function syncLabelsAndPaths() {
      const pts = pointsRef.current
      const pov = globe.pointOfView()
      const zoomed = pov.altitude < 0.38 && pts.length > 0

      if (zoomed) {
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
    pushPointsRef.current = syncLabelsAndPaths

    function createWorker() {
      if (workerRef.current) return
      try {
        workerRef.current = new Worker(new URL('../lib/tleWorker.ts', import.meta.url), { type: 'module' })
      } catch {
        workerRef.current = new Worker('/tleWorker.js')
      }

      workerRef.current.onmessage = (event: MessageEvent<any>) => {
        const start = performance.now()
        const { count, payload, norads, names } = event.data
        const points: SatellitePoint[] = []

        for (let i = 0; i < count; i++) {
          const offset = i * 5
          const lat = payload[offset]
          const lng = payload[offset + 1]
          const alt = payload[offset + 2]
          const altKm = payload[offset + 3]
          const inclination = payload[offset + 4]
          const norad = norads[i]
          const name = names[i] || ''
          const tle = tleByNoradRef.current.get(norad)
          const color = pointVizColor(vizModeRef.current, { norad, name, lat, lng, alt, altKm, inclination, color: '' }, tle)
          points.push({ norad, name, lat, lng, alt, altKm, inclination, color })
        }

        pointsRef.current = points
        updateInstanceBuffers(points)
        onPointsUpdateRef.current(points)
        onTelemetryRef.current(buildTelemetry(points, filterTlesByMenu(tlesRef.current, menuFilterRef.current)))
        onUtcRef.current(formatUtc(simTimeRef.current))
        syncLabelsAndPaths()

        if (DEBUG_TIMING) {
          console.log('Worker propagation:', performance.now() - start, 'ms', 'satellites:', count)
        }
      }
    }

    function propagate() {
      const filtered = filterTlesByMenu(tlesRef.current, menuFilterRef.current)
      if (!filtered.length) {
        pointsRef.current = []
        updateInstanceBuffers([])
        onPointsUpdateRef.current([])
        onTelemetryRef.current(buildTelemetry([], []))
        onUtcRef.current(formatUtc(simTimeRef.current))
        syncLabelsAndPaths()
        return
      }

      if (!workerRef.current) createWorker()

      if (workerRef.current) {
        workerRef.current.postMessage({ tles: filtered, timestamp: simTimeRef.current.getTime() })
      } else {
        const start = performance.now()
        const points: SatellitePoint[] = []
        for (const tle of filtered) {
          const p = propagateAll([tle], simTimeRef.current)[0]
          if (!p) continue
          const color = pointVizColor(vizModeRef.current, p, tle)
          points.push({ ...p, color })
        }
        pointsRef.current = points
        updateInstanceBuffers(points)
        onPointsUpdateRef.current(points)
        onTelemetryRef.current(buildTelemetry(points, filtered))
        onUtcRef.current(formatUtc(simTimeRef.current))
        syncLabelsAndPaths()
        if (DEBUG_TIMING) {
          console.log('Fallback propagation:', performance.now() - start, 'ms', 'satellites:', points.length)
        }
      }
    }
    propagateRef.current = propagate

    function handlePointerDown(event: PointerEvent) {
      const mesh = instancedMeshRef.current
      const glob = globeRef.current
      if (!mesh || !glob) return
      const canvas = glob.renderer()?.domElement
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, glob.camera())
      const intersects = raycaster.intersectObject(mesh, false)
      if (!intersects.length) return
      const instanceId = intersects[0].instanceId
      if (instanceId === undefined || instanceId === null) return
      const norad = instanceIdToNoradRef.current[instanceId]
      if (!norad) return

      const next = new Set(selectedRef.current)
      if (next.has(norad)) next.delete(norad)
      else next.add(norad)
      selectedRef.current = next
      onSelectionChangeRef.current(next)
      updateInstanceBuffers(pointsRef.current)
      syncLabelsAndPaths()
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
        buildSatelliteMesh(res.data.length)
        propagate()
        console.log('Loaded satellites:', res.data.length)
      } catch (e) {
        console.error('TLE load failed:', e)
      }
    }

    void loadTle()
    const tleIv = setInterval(() => void loadTle(), 50 * 60 * 1000)
    const propagationIv = setInterval(() => {
      updateTimestampRef.current = Date.now()
      if (!uiRef.current.animPaused) propagate()
    }, PROPAGATION_INTERVAL_MS)

    el.addEventListener('pointerdown', handlePointerDown)

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
      setTimeSpeed: (n: number) => {
        speedRef.current = n
      },
      stepTime: (deltaMs: number) => {
        simTimeRef.current = new Date(simTimeRef.current.getTime() + deltaMs)
        propagate()
      },
      refreshTle: () => void loadTle(),
      jumpToNow: () => {
        simTimeRef.current = new Date()
        propagate()
      },
    }

    onReadyRef.current(api)

    let raf = 0
    const loop = () => {
      const wall = performance.now()
      const dt = wall - lastFrameRef.current
      lastFrameRef.current = wall

      if (!uiRef.current.animPaused) {
        simTimeRef.current = new Date(simTimeRef.current.getTime() + dt * speedRef.current)
      }
      onUtcRef.current(formatUtc(simTimeRef.current))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(tleIv)
      clearInterval(propagationIv)
      el.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', onResize)
      if (workerRef.current) workerRef.current.terminate()
      disposeOldSatelliteMesh()
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

  useEffect(() => {
    propagateRef.current()
  }, [menuFilter])

  useEffect(() => {
    pushPointsRef.current()
  }, [vizMode])

  return <div ref={rootRef} className="absolute inset-0" />
}