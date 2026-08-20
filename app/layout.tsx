import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Cinzel, Kalam, Source_Sans_3, Source_Serif_4 } from 'next/font/google'
import './globals.css'

const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
const cinzel = Cinzel({ subsets: ['latin'], variable: '--font-cinzel', weight: ['400', '600', '700', '900'] })
const sourceSans = Source_Sans_3({ subsets: ['latin'], variable: '--font-source-sans' })
const sourceSerif = Source_Serif_4({ subsets: ['latin'], variable: '--font-source-serif' })
const kalam = Kalam({ subsets: ['latin'], variable: '--font-kalam', weight: ['300', '400', '700'] })

export const metadata: Metadata = {
  title: 'Over the Magic School — VTT de Fabula Ultima',
  description:
    'Mesa virtual imersiva para campanhas de Fabula Ultima: fichas em tempo real, dados, compendio de lore e mapas.',
  generator: 'Over the Magic School',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#17110d',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`dark bg-background ${sourceSans.variable} ${sourceSerif.variable} ${geistMono.variable} ${cinzel.variable} ${kalam.variable}`}
    >
      <body className="font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
