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

export default function GlobeView(props: any = {}) {

  const rootRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)

  // 🔥 IMPORTANT: COLOR CACHE
  const colorCacheRef = useRef<Map<number, string>>(new Map())

  useEffect(() => {
    const el = rootRef.current
    if (!el) return

    const globe = new (GlobeGL as any)(el) as GlobeInstance
    globeRef.current = globe

    const tlesRef: { current: TleRecord[] } = { current: [] }
    const tleByNoradRef = { current: new Map<number, TleRecord>() }
    const pointsRef: { current: SatellitePoint[] } = { current: [] }

    const selectedRef = { current: new Set<number>() }

    globe
      .globeImageUrl(EARTH_DAY)
      .bumpImageUrl(EARTH_BUMP)
      .backgroundImageUrl(STARFIELD)
      .backgroundColor('#020208')
      .customLayerData([])
      .customThreeObject(() => {
        const geo = new THREE.SphereGeometry(0.42, 4, 4)
        const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
        return new THREE.Mesh(geo, mat)
      })
      .customThreeObjectUpdate((obj: any, d: any) => {

        const ud = obj.userData || (obj.userData = {})

        const desiredColor = d._selected ? '#ffffff' : d.color

        // ✅ Only update when changed
        if (ud._lastColor !== desiredColor) {
          obj.material.color.set(desiredColor)
          ud._lastColor = desiredColor
        }

        if (ud._lastSelected !== d._selected) {
          obj.scale.setScalar(d._selected ? 1.5 : 1)
          ud._lastSelected = d._selected
        }

        const coords: any = globe.getCoords(d.lat, d.lng, d.alt)
        obj.position.set(coords.x || coords[0], coords.y || coords[1], coords.z || coords[2])
      })

    function pushPoints() {
      const pts = pointsRef.current

      const colored = pts.map((p) => {

        let cached = colorCacheRef.current.get(p.norad)

        if (!cached) {
          cached = pointVizColor(0, p, tleByNoradRef.current.get(p.norad))
          colorCacheRef.current.set(p.norad, cached)
        }

        return {
          ...p,
          color: selectedRef.current.has(p.norad) ? '#ffffff' : cached,
          _selected: selectedRef.current.has(p.norad),
        }
      })

      globe.customLayerData(colored)
    }

    function propagate() {
      const pts = propagateAll(tlesRef.current, new Date())
      pointsRef.current = pts
      pushPoints()
    }

    async function loadTle() {
      const res = await axios.get<TleRecord[]>('/api/tle')
      tlesRef.current = res.data

      const m = new Map<number, TleRecord>()
      for (const t of res.data) {
        m.set(noradFromLine1(t.TLE_LINE1), t)
      }
      tleByNoradRef.current = m

      propagate()
    }

    loadTle()

    globe.onCustomLayerClick((d: any) => {
      if (selectedRef.current.has(d.norad)) {
        selectedRef.current.delete(d.norad)
      } else {
        selectedRef.current.add(d.norad)
      }

      pushPoints()
    })

    let raf = 0
    const loop = () => {
      propagate()
      raf = requestAnimationFrame(loop)
    }
    loop()

    return () => cancelAnimationFrame(raf)

  }, [])

  return <div ref={rootRef} className="absolute inset-0" />
}