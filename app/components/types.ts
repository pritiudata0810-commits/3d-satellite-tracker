import type { SatellitePoint, TelemetryPayload, TleRecord } from '@/app/lib/types'

export type GlobeApi = {
  resetView: () => void
  focusOn: (lat: number, lng: number, alt?: number) => void
  setTimeSpeed: (n: number) => void
  stepTime: (deltaMs: number) => void
  jumpToNow: () => void
  refreshTle: () => void
  /** no-op placeholders for toolbar wiring */
  setBorders: (v: boolean) => void
  setGraticules: (v: boolean) => void
  setStarfield: (v: boolean) => void
  setDayTexture: (v: boolean) => void
  setClouds: (v: boolean) => void
  setOrbitTrails: (v: boolean) => void
  setTerminator: (v: boolean) => void
  togglePause: () => void
}

export type { SatellitePoint, TelemetryPayload, TleRecord }
