/** Fragmentos seguros de mensagens: links Markdown simples e URLs HTTP(S) sem HTML. */
export type MessageFragment = { text: string; href?: string }
const LINK_PATTERN = /\[([^\]\n]{1,160})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+)/gi
const TRAILING_PUNCTUATION = /[.,!?;:\])}]+$/

export function splitMessageLinks(message: string): MessageFragment[] {
  const parts: MessageFragment[] = []
  let last = 0
  for (const match of message.matchAll(LINK_PATTERN)) {
    const start = match.index
    if (start > last) parts.push({ text: message.slice(last, start) })
    const markdown = !!match[2]
    const raw = (match[2] || match[3]) as string
    const url = markdown ? raw : raw.replace(TRAILING_PUNCTUATION, "")
    const trailing = markdown ? "" : raw.slice(url.length)
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocol")
      parts.push({ text: markdown ? match[1] : url, href: parsed.href })
    } catch {
      parts.push({ text: match[0] })
    }
    if (trailing) parts.push({ text: trailing })
    last = start + match[0].length
  }
  if (last < message.length) parts.push({ text: message.slice(last) })
  return parts.length ? parts : [{ text: message }]
}
