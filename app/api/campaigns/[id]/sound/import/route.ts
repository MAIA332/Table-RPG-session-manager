import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store } from "@/lib/store"
import { musicSource } from "@/lib/music-sources"
import type { Track } from "@/lib/sound-config"

async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12000), cache: "no-store", redirect: "error" })
  if (!response.ok) throw new Error(`O serviço de música respondeu HTTP ${response.status}. Confira se o conteúdo é público e está disponível para sua aplicação.`)
  return response.json()
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  const { id } = await params
  const campaign = store.campaigns.get(id)
  if (!user || !campaign || getMemberRole(campaign, user.id) !== "gm")
    return NextResponse.json({ error: "Somente o Mestre pode importar músicas." }, { status: 403 })
  const body = await request.json().catch(() => null)
  const source = typeof body?.url === "string" ? musicSource(body.url.trim()) : null
  if (!source) return NextResponse.json({ error: "Cole um link HTTPS de vídeo/playlist do YouTube ou faixa/álbum/playlist do Spotify." }, { status: 400 })
  try {
    const tracks: Track[] = []
    const track = (name: string, url: string, key: string): Track => ({ id: `import_${source.provider}_${key}`, name: name.slice(0, 200), url, loopable: true, isCustom: true })
    if (source.provider === "youtube") {
      if (source.kind === "playlist" && process.env.YOUTUBE_API_KEY) {
        let page = ""
        do {
          const query = new URLSearchParams({ part: "snippet", playlistId: source.id, maxResults: "50", key: process.env.YOUTUBE_API_KEY, ...(page ? { pageToken: page } : {}) })
          const result = await json(`https://www.googleapis.com/youtube/v3/playlistItems?${query}`)
          for (const item of result.items || []) {
            const video = item.snippet?.resourceId?.videoId
            if (typeof video === "string" && /^[\w-]{11}$/.test(video)) tracks.push(track(item.snippet.title || "Vídeo", `https://www.youtube.com/watch?v=${video}`, video))
          }
          page = result.nextPageToken || ""
        } while (page && tracks.length < 500)
      } else if (source.kind === "playlist") {
        throw new Error("Configure YOUTUBE_API_KEY no .env para importar playlists. Links individuais de vídeo funcionam sem chave.")
      } else {
        const meta = await json(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(source.url)}`)
        tracks.push(track(meta.title || "YouTube", source.url, source.id))
      }
    } else if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
      const token = await json("https://accounts.spotify.com/api/token", { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" })
      const headers = { Authorization: `Bearer ${token.access_token}` }
      if (source.kind === "track" || source.kind === "episode") {
        const result = await json(`https://api.spotify.com/v1/${source.kind}s/${source.id}`, { headers })
        tracks.push(track(`${result.name}${result.artists ? " — " + result.artists.map((artist: any) => artist.name).join(", ") : ""}`, source.url, source.id))
      } else {
        let offset = 0
        let more = true
        while (more && tracks.length < 500) {
          const result = await json(`https://api.spotify.com/v1/${source.kind}s/${source.id}/${source.kind === "album" ? "tracks" : "items"}?limit=50&offset=${offset}`, { headers })
          for (const row of result.items || []) {
            const item = row.item || row.track || row
            if (item?.id && item.type === "track") tracks.push(track(`${item.name} — ${(item.artists || []).map((artist: any) => artist.name).join(", ")}`, `https://open.spotify.com/track/${item.id}`, item.id))
          }
          more = Boolean(result.next); offset += 50
        }
      }
    } else {
      // oEmbed é a API pública do Spotify e não exige segredo no navegador.
      const meta = await json(`https://open.spotify.com/oembed?url=${encodeURIComponent(source.url)}`)
      tracks.push(track(meta.title || "Spotify", source.url, source.id))
    }
    if (!tracks.length) throw new Error("Nenhuma música disponível foi encontrada.")
    return NextResponse.json({ tracks, provider: source.provider })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível importar o conteúdo." }, { status: 400 })
  }
}
