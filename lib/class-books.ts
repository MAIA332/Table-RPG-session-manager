/** Schema v1 dos livros de classe. Conteúdo sempre criado pelo mestre. */
export type BookKind = "spellbook" | "blueprints"
export type BookResource = "mp" | "hp" | "ip"
export type BookUnlockMode = "all" | "grant" | "learn"

export interface ClassBookEntry {
  id: string
  name: string
  description: string
  imageUrl?: string
  kind?: string
  rarity?: string
  tier?: number
  /** Nível MÍNIMO da classe do grimório necessário para visualizar e conjurar. Legado: 1. */
  requiredClassLevel?: number
  tags?: string[]
  cost?: { resource: BookResource; amount: number }
  materials?: { name: string; amount: number }[]
  craftingTime?: string
  result?: string
  effects?: string
  published: boolean
  /** Efeitos aplicados na conjuração, ativos até serem removidos pelo Mestre. */
  checkBonuses?: { target: string; value: number }[]
  /** Nulo ou ausente = ilimitado. Inteiro entre 10 e 600 segundos. */
  bonusDurationSeconds?: number | null
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
  /** Cooldown de um ciclo esgotado: 60 a 7200 segundos; ausente = modo legado. */
  cooldownSeconds?: number | null
  entries: ClassBookEntry[]
  updatedAt: number
}

export interface ClassBookDeck {
  drawPile: string[]
  hand: string[]
  discardPile: string[]
  /** Assinatura do conjunto de cartas permitido quando o baralho foi reconciliado. */
  poolSignature?: string
  cooldownStartedAt?: number
  cooldownUntil?: number
}

export interface ClassBookProgress {
  subclassIds: string[]
  granted: Record<string, string[]>
  /** Revogações individuais prevalecem inclusive sobre livros em modo automático. */
  denied?: Record<string, string[]>
  deck?: Record<string, ClassBookDeck>
  /** Recibos persistidos para impedir duplo débito de Lore ao repetir o requestId. */
  learningReceipts?: Record<string, { bookId: string; entryId: string }>
}

export interface ClassBookDeckView {
  drawCount: number
  hand: string[]
  discardPile: string[]
  cooldownStartedAt?: number
  cooldownUntil?: number
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

/**
 * Obtém o nível real da classe vinculada a um livro pela ficha persistida.
 * Uma subclasse selecionada herda o nível da classe-mãe quando não possui
 * progressão própria; a seleção da especialização continua obrigatória.
 */
export function characterBookClassLevel(
  character: unknown,
  classId: string,
  progress: ClassBookProgress,
  definitions: ReadonlyArray<{ id: string; parentClassId?: string }> = [],
): number {
  if (!character || typeof character !== "object") return 0
  const raw = (character as { classes?: unknown }).classes
  if (!Array.isArray(raw)) return 0
  const levelFor = (id: string): number => {
    let highest = 0
    for (const item of raw) {
      if (typeof item === "string") {
        if (item === id) highest = Math.max(highest, 1)
        continue
      }
      if (!item || typeof item !== "object") continue
      const value = item as Record<string, unknown>
      if ((value.classId ?? value.id) !== id) continue
      // Fichas antigas podiam armazenar a classe sem campo de nível.
      const number = value.level == null ? 1 : Number(value.level)
      if (Number.isSafeInteger(number) && number > 0) highest = Math.max(highest, number)
    }
    return highest
  }
  const direct = levelFor(classId)
  const parent = definitions.find(def => def.id === classId)?.parentClassId
  if (!parent) return direct
  if (!progress.subclassIds.includes(classId) && direct === 0) return 0
  return direct || levelFor(parent)
}

/** Acesso cumulativo: nível 2 vê cartas de nível mínimo 1 e 2. */
export function isCardAccessible(
  book: ClassBook,
  entry: ClassBookEntry,
  progress: ClassBookProgress,
  hasClassAccess = true,
  classLevel = 0,
): boolean {
  if (book.kind === "spellbook" && (!Number.isSafeInteger(classLevel) || classLevel < 1 || (entry.requiredClassLevel ?? 1) > classLevel)) return false
  if (!entry.published) return false
  if ((progress.denied?.[book.id] ?? []).includes(entry.id)) return false
  return (
    (progress.granted[book.id] ?? []).includes(entry.id) ||
    (hasClassAccess && book.unlockMode === "all")
  )
}

export function permittedBook(
  book: ClassBook,
  progress: ClassBookProgress,
  hasClassAccess = true,
  classLevel = 0,
): ClassBook {
  return {
    ...book,
    entries: book.entries.filter((entry) =>
      isCardAccessible(book, entry, progress, hasClassAccess, classLevel)),
  }
}

export function canAccessBook(
  book: ClassBook,
  progress: ClassBookProgress,
  hasClassAccess: boolean,
  classLevel = 0,
): boolean {
  return permittedBook(book, progress, hasClassAccess, classLevel).entries.length > 0 ||
    (hasClassAccess && (book.kind !== "spellbook" || classLevel > 0))
}

/**
 * Assinatura do conjunto efetivamente autorizado para ESTE personagem.
 * Permite detectar novas publicações, atribuições e mudanças de cópias sem
 * confundir um deck realmente esgotado com um deck desatualizado.
 */
export function classBookPoolSignature(
  book: ClassBook,
  progress: ClassBookProgress,
  hasClassAccess: boolean,
  classLevel = 0,
): string {
  const entries = permittedBook(book, progress, hasClassAccess, classLevel).entries
  return JSON.stringify(entries.map((entry) => [entry.id, entry.copies ?? 1]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
}

/**
 * Reconcilia decks legados e decks de jogadores depois de alterações do mestre.
 * Preserva primeiro a mão e o descarte, depois as cartas ainda no monte.
 * Só adiciona cópias quando o conjunto autorizado mudou; assim um monte
 * verdadeiramente esgotado não é reabastecido a cada GET.
 */
export function reconcileClassBookDeck(
  book: ClassBook,
  progress: ClassBookProgress,
  hasClassAccess: boolean,
  deck: ClassBookDeck,
  classLevel = 0,
): ClassBookDeck {
  const authorized = permittedBook(book, progress, hasClassAccess, classLevel).entries
  const expected = new Map(authorized.map((entry) => [entry.id, entry.copies ?? 1]))
  const signature = classBookPoolSignature(book, progress, hasClassAccess, classLevel)
  const used = new Map<string, number>()
  const keep = (cards: unknown): string[] => {
    if (!Array.isArray(cards)) return []
    return cards.filter((card): card is string => {
      if (typeof card !== "string") return false
      const limit = expected.get(card) ?? 0
      const count = used.get(card) ?? 0
      if (count >= limit) return false
      used.set(card, count + 1)
      return true
    })
  }
  const hand = keep(deck.hand)
  const discardPile = keep(deck.discardPile)
  const drawPile = keep(deck.drawPile)
  if (deck.poolSignature !== signature) {
    for (const [cardId, maxCopies] of expected) {
      for (let count = used.get(cardId) ?? 0; count < maxCopies; count += 1) {
        drawPile.push(cardId)
      }
    }
  }
  // Alterações nas permissões invalidam cooldown apenas quando há novas cartas.
  const freshCards = deck.poolSignature !== signature && drawPile.length > 0
  return {
    drawPile, hand, discardPile, poolSignature: signature,
    ...(!freshCards && typeof deck.cooldownStartedAt === "number" && Number.isFinite(deck.cooldownStartedAt) &&
    typeof deck.cooldownUntil === "number" && Number.isFinite(deck.cooldownUntil)
      ? { cooldownStartedAt: deck.cooldownStartedAt, cooldownUntil: deck.cooldownUntil }
      : {}),
  }
}

/** Tempo em epoch millisecond: resistem a reloads, reconexões e múltiplas abas. */
export function isExpiredClassBookModifier(value: unknown, now = Date.now()): boolean {
  if (!value || typeof value !== "object") return false
  const mod = value as { id?: unknown; expiresAt?: unknown }
  return typeof mod.id === "string" && mod.id.startsWith(CLASS_BOOK_BONUS_PREFIX) &&
    typeof mod.expiresAt === "number" && Number.isFinite(mod.expiresAt) && mod.expiresAt <= now
}

export function activeClassBookModifiers<T>(mods: T[], now = Date.now()): T[] {
  return mods.filter(mod => !isExpiredClassBookModifier(mod, now))
}

export function deckCycleExhausted(deck: Pick<ClassBookDeck, "drawPile" | "hand">): boolean {
  return deck.drawPile.length === 0 && deck.hand.length === 0
}

export function deckCooldownRemaining(deck: Pick<ClassBookDeck, "cooldownUntil">, now = Date.now()): number {
  return Math.max(0, Number(deck.cooldownUntil || 0) - now)
}

/** Identificadores estáveis: conjurar novamente substitui o bônus, não o empilha. */
export const CLASS_BOOK_BONUS_PREFIX = "class_book_bonus:"
export function cardBonusPrefix(bookId: string, entryId: string): string {
  return `${CLASS_BOOK_BONUS_PREFIX}${bookId}:${entryId}:`
}

export function cardBonusModifiers(bookId: string, entry: ClassBookEntry, now = Date.now()) {
  const duration = entry.bonusDurationSeconds
  return (entry.checkBonuses ?? []).map((bonus) => ({
    id: `${cardBonusPrefix(bookId, entry.id)}${encodeURIComponent(bonus.target)}`,
    name: `${entry.name} (magia)`,
    target: bonus.target,
    value: bonus.value,
    type: "class_book_effect",
    ...(typeof duration === "number" ? {
      startedAt: now,
      durationMs: duration * 1000,
      expiresAt: now + duration * 1000,
    } : {}),
  }))
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
  if (unlockMode !== "all" && unlockMode !== "grant" && unlockMode !== "learn") throw new Error("Modo de liberação inválido.")
  if (kind !== "spellbook" && unlockMode === "learn") throw new Error("Aprendizado está disponível apenas para grimórios de magia.")
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
    const requiredClassLevel = entry.requiredClassLevel == null ? 1 : entry.requiredClassLevel
    if (typeof requiredClassLevel !== "number" || !Number.isSafeInteger(requiredClassLevel) || requiredClassLevel < 1 || requiredClassLevel > 30)
      throw new Error("Nível exigido da classe deve ser um inteiro entre 1 e 30.")
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
    const rawBonuses = entry.checkBonuses
    if (rawBonuses != null && (!Array.isArray(rawBonuses) || rawBonuses.length > 12))
      throw new Error("A carta aceita até 12 bônus de testes.")
    const targets = new Set<string>()
    const checkBonuses = Array.isArray(rawBonuses) ? rawBonuses.map((rawBonus: unknown) => {
      if (!rawBonus || typeof rawBonus !== "object" || Array.isArray(rawBonus))
        throw new Error("Bônus de teste inválido.")
      const b = rawBonus as Record<string, unknown>
      const target = typeof b.target === "string" ? b.target.trim() : ""
      const value = b.value
      if (!target || target.length > 120 || targets.has(target) ||
          typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 50)
        throw new Error("Bônus inválido: selecione alvos diferentes e valores de +1 a +50.")
      targets.add(target)
      return { target, value }
    }) : []
    const duration = entry.bonusDurationSeconds
    if (duration != null && (typeof duration !== "number" || !Number.isInteger(duration) || duration < 10 || duration > 600))
      throw new Error("Duração de bônus deve ser ilimitada ou de 10 a 600 segundos.")
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
      requiredClassLevel,
      copies,
      tags,
      cost,
      materials,
      craftingTime: readOptional(entry, "craftingTime", 120),
      result: readOptional(entry, "result", 2000),
      effects: readOptional(entry, "effects", 4000),
      published: entry.published === true,
      checkBonuses,
      bonusDurationSeconds: typeof duration === "number" ? duration : null,
    }
  })
  const cooldownSeconds = raw.cooldownSeconds
  if (cooldownSeconds != null &&
      (typeof cooldownSeconds !== "number" || !Number.isInteger(cooldownSeconds) || cooldownSeconds < 60 || cooldownSeconds > 7200))
    throw new Error("Cooldown do grimório deve ficar entre 60 e 7200 segundos.")
  const handLimit = raw.handLimit == null ? 7 : Number(raw.handLimit)
  if (!Number.isInteger(handLimit) || handLimit < 1 || handLimit > 20) throw new Error("Limite de mão inválido.")
  const playMode = raw.playMode === "gallery" ? "gallery" : "deck"
  const description = typeof raw.description === "string" ? raw.description : ""
  if (description.length > 4000) throw new Error("Descrição do livro muito longa.")
  const coverUrl = readOptional(raw, "coverUrl", 2000)
  return { id, classId, kind, name, description, coverUrl, unlockMode,
    playMode: kind === "blueprints" ? "gallery" : playMode,
    allowPlayerReset: raw.allowPlayerReset === true, handLimit,
    cooldownSeconds: typeof cooldownSeconds === "number" ? cooldownSeconds : null,
    entries: normalized, updatedAt: Date.now() }
}
