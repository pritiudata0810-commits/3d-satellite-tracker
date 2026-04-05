import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '3D Satellite Tracker',
  description: 'Real-time 3D satellite tracking with live TLE data',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-black text-white">{children}</body>
    </html>
  )
}
