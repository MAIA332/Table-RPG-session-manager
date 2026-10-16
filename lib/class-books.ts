/** Schema v1 dos livros de classe. Conteúdo sempre criado pelo mestre. */
export type BookKind = "spellbook" | "blueprints"
export type BookResource = "mp" | "hp" | "ip"
export type BookUnlockMode = "all" | "grant"

export interface ClassBookEntry {
  id: string
  name: string
  description: string
  imageUrl?: string
  kind?: string
  rarity?: string
  tier?: number
  tags?: string[]
  cost?: { resource: BookResource; amount: number }
  materials?: { name: string; amount: number }[]
  craftingTime?: string
  result?: string
  effects?: string
  published: boolean
  copies?: number
}

export interface ClassBook {
  id: string
  classId: string
  kind: BookKind
  name: string
  description: string
  coverUrl?: string
  unlockMode: BookUnlockMode
  playMode?: "gallery" | "deck"
  allowPlayerReset?: boolean
  handLimit?: number
  entries: ClassBookEntry[]
  updatedAt: number
}

export interface ClassBookDeck {
  drawPile: string[]
  hand: string[]
  discardPile: string[]
}

export interface ClassBookProgress {
  subclassIds: string[]
  granted: Record<string, string[]>
  deck?: Record<string, ClassBookDeck>
}

export interface ClassBookDeckView {
  drawCount: number
  hand: string[]
  discardPile: string[]
}

export interface ClassBookActivity {
  id: string
  characterId: string
  bookId: string
  entryId: string
  action: "cast" | "craft-request"
  status?: "pending" | "approved" | "rejected"
  at: number
  resource?: BookResource
  spent?: number
}

export interface CampaignClassBooks {
  books: ClassBook[]
  progress: Record<string, ClassBookProgress>
  activity: ClassBookActivity[]
  revision: number
}

export function emptyClassBooks(): CampaignClassBooks {
  return { books: [], progress: {}, activity: [], revision: 0 }
}

export function characterClassIds(character: unknown): string[] {
  if (!character || typeof character !== "object") return []
  const classes = (character as { classes?: unknown }).classes
  if (!Array.isArray(classes)) return []
  return classes.flatMap((item) => {
    if (typeof item === "string") return [item]
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const id = record.classId ?? record.id
    return typeof id === "string" ? [id] : []
  })
}

export function progressFor(data: CampaignClassBooks, characterId: string): ClassBookProgress {
  return data.progress[characterId] ?? { subclassIds: [], granted: {} }
}

export function accessibleClassIds(character: unknown, progress: ClassBookProgress): string[] {
  return [...new Set([...characterClassIds(character), ...progress.subclassIds])]
}

export function permittedBook(book: ClassBook, progress: ClassBookProgress): ClassBook {
  return {
    ...book,
    entries: book.entries.filter((entry) =>
      entry.published && (book.unlockMode === "all" ||
        (progress.granted[book.id] ?? []).includes(entry.id)),
    ),
  }
}

export function validateBook(value: unknown): ClassBook {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Livro inválido.")
  const raw = value as Record<string, unknown>
  const required = (field: string, limit: number) => {
    const text = raw[field]
    if (typeof text !== "string" || !text.trim() || text.length > limit)
      throw new Error(`Campo ${field} inválido.`)
    return text.trim()
  }
  const id = required("id", 120)
  const classId = required("classId", 120)
  const name = required("name", 140)
  const kind = raw.kind
  if (kind !== "spellbook" && kind !== "blueprints") throw new Error("Mecânica inválida.")
  const unlockMode = raw.unlockMode
  if (unlockMode !== "all" && unlockMode !== "grant") throw new Error("Modo de liberação inválido.")
  const entries = raw.entries
  if (!Array.isArray(entries) || entries.length > 250) throw new Error("Limite de 250 cartas/projetos por livro.")
  const ids = new Set<string>()
  const readOptional = (record: Record<string, unknown>, field: string, limit: number) => {
    const value = record[field]
    if (value == null || value === "") return undefined
    if (typeof value !== "string" || value.length > limit) throw new Error(`${field} inválido.`)
    return value
  }
  const normalized: ClassBookEntry[] = entries.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Carta inválida.")
    const entry = item as Record<string, unknown>
    if (typeof entry.id !== "string" || !entry.id.trim() || entry.id.length > 120 || ids.has(entry.id))
      throw new Error("IDs de cartas inválidos ou duplicados.")
    ids.add(entry.id)
    if (typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 140)
      throw new Error("Nome da carta inválido.")
    if (typeof entry.description !== "string" || entry.description.length > 6000)
      throw new Error("Descrição da carta inválida.")
    const copies = entry.copies == null ? 1 : Number(entry.copies)
    if (!Number.isInteger(copies) || copies < 1 || copies > 4) throw new Error("Quantidade de cópias inválida (1–4).")
    const tier = entry.tier == null ? 1 : Number(entry.tier)
    if (!Number.isInteger(tier) || tier < 1 || tier > 30) throw new Error("Nível da carta inválido.")
    const rawCost = entry.cost as Record<string, unknown> | undefined
    let cost: ClassBookEntry["cost"]
    if (rawCost != null) {
      if (!["mp", "hp"].includes(String(rawCost.resource))) throw new Error("Use PV ou PM. PI agora representa capacidade de carga e não pode ser consumido.")
      const amount = Number(rawCost.amount)
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100000) throw new Error("Custo inválido.")
      cost = { resource: rawCost.resource as BookResource, amount }
    }
    if (entry.materials != null && (!Array.isArray(entry.materials) || entry.materials.length > 40))
      throw new Error("Lista de materiais inválida.")
    const materials = Array.isArray(entry.materials) ? entry.materials.map((m: unknown) => {
      if (!m || typeof m !== "object") throw new Error("Material inválido.")
      const item = m as Record<string, unknown>
      if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 140 ||
        (typeof item.amount !== "number" || !Number.isSafeInteger(item.amount)) || Number(item.amount) < 1 || Number(item.amount) > 100000)
        throw new Error("Material inválido.")
      return { name: item.name.trim(), amount: Number(item.amount) }
    }) : []
    const tags = Array.isArray(entry.tags) ? entry.tags.filter((tag): tag is string => typeof tag === "string")
      .slice(0, 15).map((tag) => tag.slice(0, 50)) : []
    return {
      id: entry.id,
      name: entry.name.trim(),
      description: entry.description,
      imageUrl: readOptional(entry, "imageUrl", 2000),
      kind: readOptional(entry, "kind", 80),
      rarity: readOptional(entry, "rarity", 80),
      tier,
      copies,
      tags,
      cost,
      materials,
      craftingTime: readOptional(entry, "craftingTime", 120),
      result: readOptional(entry, "result", 2000),
      effects: readOptional(entry, "effects", 4000),
      published: entry.published === true,
    }
  })
  const handLimit = raw.handLimit == null ? 7 : Number(raw.handLimit)
  if (!Number.isInteger(handLimit) || handLimit < 1 || handLimit > 20) throw new Error("Limite de mão inválido.")
  const playMode = raw.playMode === "gallery" ? "gallery" : "deck"
  const description = typeof raw.description === "string" ? raw.description : ""
  if (description.length > 4000) throw new Error("Descrição do livro muito longa.")
  const coverUrl = readOptional(raw, "coverUrl", 2000)
  return { id, classId, kind, name, description, coverUrl, unlockMode,
    playMode: kind === "blueprints" ? "gallery" : playMode,
    allowPlayerReset: raw.allowPlayerReset === true, handLimit, entries: normalized, updatedAt: Date.now() }
}
