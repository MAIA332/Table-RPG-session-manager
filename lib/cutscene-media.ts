export function cutsceneMedia(raw: string): { kind: "youtube" | "vimeo" | "file" | "embed" | "invalid"; url: string } {
  let url: URL
  try { url = new URL(raw) } catch { return { kind: "invalid", url: "" } }
  if (!["http:", "https:"].includes(url.protocol)) return { kind: "invalid", url: "" }
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  if (["youtube.com", "m.youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) {
    const id = host === "youtu.be" ? url.pathname.split("/")[1]
      : url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1]
    if (!id || !/^[\w-]+$/.test(id)) return { kind: "invalid", url: "" }
    const embed = new URL(`https://www.youtube.com/embed/${id}`)
    embed.searchParams.set("autoplay", "1")
    embed.searchParams.set("mute", "1")
    embed.searchParams.set("playsinline", "1")
    embed.searchParams.set("rel", "0")
    embed.searchParams.set("enablejsapi", "1")
    const start = url.searchParams.get("start") || url.searchParams.get("t")
    if (start && /^\d+s?$/.test(start)) embed.searchParams.set("start", start.replace(/s$/, ""))
    return { kind: "youtube", url: embed.toString() }
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = url.pathname.match(/(?:\/video)?\/(\d+)/)?.[1]
    if (!id) return { kind: "invalid", url: "" }
    const embed = new URL(`https://player.vimeo.com/video/${id}`)
    const hash = url.searchParams.get("h") || url.pathname.match(/^\/\d+\/([a-zA-Z0-9]+)/)?.[1]
    if (hash) embed.searchParams.set("h", hash)
    embed.searchParams.set("autoplay", "1"); embed.searchParams.set("muted", "1")
    return { kind: "vimeo", url: embed.toString() }
  }
  if (/\.(mp4|webm|ogv|ogg|mov)$/i.test(url.pathname)) return { kind: "file", url: url.toString() }
  url.searchParams.set("autoplay", "1")
  return { kind: "embed", url: url.toString() }
}
