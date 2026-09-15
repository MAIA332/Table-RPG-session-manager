/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['jrpg.slip.io', 'app-mortemagica.sinapselabs.com.br'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "connect-src 'self' https://app-mortemagica.sinapselabs.com.br wss://app-mortemagica.sinapselabs.com.br;"
          }
        ]
      }
    ]
  },
}

export default nextConfig