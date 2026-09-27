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
  webpack: (config) => {
    // Ignora alterações nos arquivos do banco de dados para evitar reloads acidentais
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        ...((config.watchOptions && config.watchOptions.ignored) || []),
        '**/vtt-database.json',
        '**/vtt-database.json.bak'
      ],
    };
    return config;
  },
}

export default nextConfig;