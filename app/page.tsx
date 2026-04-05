'use client'

import dynamic from 'next/dynamic'

const TrackerExperience = dynamic(() => import('./components/TrackerExperience'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-black text-zinc-400">
      Loading 3D Satellite Tracker…
    </div>
  ),
})

export default function HomePage() {
  return <TrackerExperience />
}