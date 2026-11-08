export type MusicSource = { provider: "youtube"; kind: "video" | "playlist"; id: string; url: string } |
  { provider: "spotify"; kind: "track" | "album" | "playlist" | "episode"; id: string; url: string }

export function musicSource(raw: string): MusicSource | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.username || url.password) return null
    const host = url.hostname.replace(/^www\./, "")
    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) {
      const id = host === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/)?.[1]
      if (id && /^[\w-]{11}$/.test(id)) return { provider: "youtube", kind: "video", id, url: `https://www.youtube.com/watch?v=${id}` }
      const list = url.searchParams.get("list")
      if (list && /^[\w-]{10,100}$/.test(list)) return { provider: "youtube", kind: "playlist", id: list, url: `https://www.youtube.com/playlist?list=${list}` }
    }
    if (host === "open.spotify.com") {
      const match = url.pathname.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|episode)\/([a-zA-Z0-9]{22})\/?$/)
      if (match) return { provider: "spotify", kind: match[1] as "track" | "album" | "playlist" | "episode", id: match[2], url: `https://open.spotify.com/${match[1]}/${match[2]}` }
    }
  } catch {}
  return null
}
