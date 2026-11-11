/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  allowedDevOrigins: ['jrpg.slip.io', 'app-mortemagica.sinapselabs.com.br','192.168.18.57','localhost'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "connect-src 'self' https://app-mortemagica.sinapselabs.com.br wss://app-mortemagica.sinapselabs.com.br https://www.youtube.com https://www.youtube-nocookie.com https://open.spotify.com https://voice.sinapselabs.com.br wss://voice.sinapselabs.com.br;",
          }
        ]
      }
    ]
  },
}

export default nextConfig
