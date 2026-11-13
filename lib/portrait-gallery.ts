/** Limite máximo de segurança; cada personagem começa com cinco retratos. */
export const MAX_CHARACTER_PORTRAITS = 50
export const MAX_ALTERNATE_PORTRAITS = MAX_CHARACTER_PORTRAITS - 1
export const DEFAULT_CHARACTER_PORTRAITS = 5
export function characterPortraitLimit(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_CHARACTER_PORTRAITS
    ? value : DEFAULT_CHARACTER_PORTRAITS
}

export interface AlternatePortrait {
  id: string
  label: string
  url: string
}

export interface DisplayPortrait extends AlternatePortrait {
  isPrimary: boolean
}

export type CharacterPortraitCollection = {
  avatarUrl?: string
  portraitLabel?: string
  portraitGallery?: AlternatePortrait[]
  portraitLimit?: number
}

export function publicPortraitUrl(value: string): boolean {
  if (typeof value !== "string" || value.length > 2048) return false
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return url.protocol === "https:" && Boolean(host) &&
      !url.username && !url.password &&
      host !== "localhost" && host !== "0.0.0.0" && host !== "[::1]" &&
      !host.endsWith(".localhost") && !host.endsWith(".local") &&
      !/^(?:10|127|192\.168)\./.test(host) &&
      !/^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
  } catch { return false }
}

export function validPortraitImage(value: string): boolean {
  return publicPortraitUrl(value) || (typeof value === "string" && value.length <= 3_500_000 &&
    /^data:image\/(?:png|jpeg|jpg|webp|gif|avif);base64,[a-z0-9+/]+={0,2}$/i.test(value)) ||
    (typeof value === "string" && /^\/(?!\/)[a-z0-9_./%-]+$/i.test(value) && !value.includes(".."))
}

/** Leitura tolerante de fichas legadas; não modifica o banco. */
export function getDisplayPortraits(character: CharacterPortraitCollection): DisplayPortrait[] {
  const primary: DisplayPortrait = {
    id: "__primary__",
    label: (typeof character.portraitLabel === "string" && character.portraitLabel.trim()) || "Normal",
    url: character.avatarUrl || "/mystic-adventurer-portrait.png",
    isPrimary: true,
  }
  const found = new Set<string>()
  const extras = (Array.isArray(character.portraitGallery) ? character.portraitGallery : [])
    .filter((item): item is AlternatePortrait => Boolean(item && typeof item === "object" &&
      typeof item.id === "string" && typeof item.url === "string" &&
      typeof item.label === "string" && validPortraitImage(item.url)))
    .filter(item => {
      if (found.has(item.id) || item.url === primary.url) return false
      found.add(item.id)
      return true
    })
    .slice(0, MAX_ALTERNATE_PORTRAITS)
    .map(item => ({ ...item, isPrimary: false }))
  return [primary, ...extras]
}

/** Validação estrita para gravação de uploads comprimidos e URLs públicas. */
export function validateAlternatePortraits(raw: unknown, limit = DEFAULT_CHARACTER_PORTRAITS): AlternatePortrait[] {
  const maximum = characterPortraitLimit(limit)
  if (!Array.isArray(raw) || raw.length > maximum - 1) {
    throw new Error(`Este personagem pode cadastrar até ${maximum} retratos, incluindo o principal.`)
  }
  const ids = new Set<string>()
  const urls = new Set<string>()
  return raw.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Retrato ${index + 2} inválido.`)
    }
    const row = item as Record<string, unknown>
    const id = typeof row.id === "string" ? row.id.trim() : ""
    const label = typeof row.label === "string" ? row.label.trim() : ""
    const url = typeof row.url === "string" ? row.url.trim() : ""
    if (!/^[a-zA-Z0-9:_-]{1,90}$/.test(id) || id === "__primary__" || ids.has(id))
      throw new Error(`Identificador do retrato ${index + 2} inválido ou repetido.`)
    if (!label || label.length > 60) throw new Error(`A legenda do retrato ${index + 2} deve ter de 1 a 60 caracteres.`)
    if (!validPortraitImage(url)) throw new Error(`O retrato ${index + 2} precisa de uma imagem enviada ou de uma URL HTTPS pública.`)
    if (urls.has(url)) throw new Error("Não repita a mesma imagem entre os retratos alternativos.")
    ids.add(id)
    urls.add(url)
    return { id, label, url }
  })
}
