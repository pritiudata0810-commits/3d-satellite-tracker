# 3D Satellite Tracker

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind + `globe.gl` + `satellite.js` + Space-Track–backed TLE API.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment (Vercel / `.env.local`)

Space-Track (preferred):

- `SPACETRACK_USER` and `SPACETRACK_PASS`  
  _or_ `SPACETRACK_USERNAME` / `SPACETRACK_PASSWORD` (aliases supported)

Without credentials, the API falls back to public TLE sources (smaller catalog).

## Scripts

- `npm run dev` — Next dev server  
- `npm run build` — production build  
- `npm run start` — start production server  

## API routes

- `GET /api/tle` — full cached catalog  
- `GET /api/starlink`, `/api/gps`, `/api/kuiper`, `/api/active` — filtered views (same cache)  

TLE responses are cached in memory for ~45 minutes per serverless instance.
