import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['satellite.js'],
  reactStrictMode: true,
}

export default nextConfig
