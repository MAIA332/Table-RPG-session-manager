import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { CLASSES, type GameClass } from "@/lib/game-data"
import { getCampaignClassCatalog } from "@/lib/class-catalog"
import { isClassAvailableToPlayers, playerVisibleClassCatalog, type CustomClassVisibility } from "@/lib/class-visibility"
import {
  accessibleClassIds,
  canAccessBook,
  cardBonusModifiers,
  cardBonusPrefix,
  permittedBook,
  characterClassIds,
  characterBookClassLevel,
  emptyClassBooks,
  progressFor,
  reconcileClassBookDeck,
  classBookPoolSignature,
  activeClassBookModifiers,
  deckCooldownRemaining,
  deckCycleExhausted,
  validateBook,
  type CampaignClassBooks,
  type ClassBookDeck,
  type ClassBookProgress,
} from "@/lib/class-books"
import { getMemberRole, publish, store, transactStore } from "@/lib/store"
import type { Character, RealtimeEvent } from "@/lib/types"
import { randomInt } from "node:crypto"
import { prepareClassBookLearning, summarizeClassBookLevels } from "@/lib/class-books-learning"

type RouteContext = { params: Promise<{ id: string }> }

/** Resultado uniforme de todos os caminhos (incluindo retornos idempotentes). */
type ClassBookMutationResult = {
  activity: CampaignClassBooks["activity"][number] | null
  learnedEntryId: string | null
  revision: number
  duplicate: boolean
  changed: boolean
}

/**
 * A ficha persiste customModifiers, mesmo em versões antigas de lib/types.ts
 * que ainda não declaram essa propriedade em Character.
 *
 * A interseção é local à rota; preserva modificadores antigos, inclusive
 * seus campos extras, e evita mudar o contrato global sem conhecer types.ts.
 */
type StoredCharacterModifier = {
  id?: string
  name?: string
  target?: string
  value?: number
  type?: string
  startedAt?: number
  durationMs?: number
  expiresAt?: number
}

type CharacterWithModifiers = Character & {
  customModifiers?: StoredCharacterModifier[]
}

function readCharacterModifiers(character: Character): StoredCharacterModifier[] {
  const modifiers = (character as CharacterWithModifiers).customModifiers
  return Array.isArray(modifiers) ? modifiers : []
}

function updatedCharacterWithModifiers(
  character: Character,
  modifiers: StoredCharacterModifier[],
  resources: Character["resources"] = character.resources,
): Character {
  const next: CharacterWithModifiers = {
    ...character,
    resources,
    customModifiers: modifiers,
    updatedAt: Math.max(Date.now(), Number(character.updatedAt || 0) + 1),
  }
  return next
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

async function access(context: RouteContext) {
  const user = await getCurrentUser()
  if (!user) return { error: jsonError("Não autenticado.", 401) } as const
  const { id } = await context.params
  const campaign = store.campaigns.get(id)
  if (!campaign) return { error: jsonError("Campanha não encontrada.", 404) } as const
  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: jsonError("Sem acesso à campanha.", 403) } as const
  return { id, user, role, error: null } as const
}

function customDefinitions(campaignId: string): CustomClassVisibility[] {
  const state = store.campaignState.get(campaignId)
  const classes = Array.isArray(state?.customClasses) ? state.customClasses : []
  return classes.filter((value): value is CustomClassVisibility =>
    Boolean(value && typeof value === "object" && typeof value.id === "string" && typeof value.name === "string"))
}

function allClasses(campaignId: string) {
  const campaignCharacters = [...store.characters.values()].filter(character => character.campaignId === campaignId)
  const definitions = store.campaignState.get(campaignId)?.customClasses
  const custom = Array.isArray(definitions) ? definitions as GameClass[] : []
  return getCampaignClassCatalog(campaignCharacters, custom).map(({ id, name, parentClassId }) => ({ id, name, ...(parentClassId ? { parentClassId } : {}) }))
}

function snapshot(campaignId: string) {
  return store.classBooks.get(campaignId) ?? emptyClassBooks()
}

function isCharacterMember(campaignId: string, userId: string, characterId: string, gm: boolean) {
  const character = store.characters.get(characterId)
  if (!character || character.campaignId !== campaignId || (!gm && character.ownerId !== userId)) return null
  return character
}

function validId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 120
}

function shuffle<T>(items: T[]): T[] {
  const array = [...items]
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

function bookLevel(book: CampaignClassBooks["books"][number], character: unknown, progress: ClassBookProgress, campaignId: string): number {
  return characterBookClassLevel(character, book.classId, progress, allClasses(campaignId))
}

function ownsBookClass(book: CampaignClassBooks["books"][number], character: unknown, progress: ClassBookProgress): boolean {
  return accessibleClassIds(character, progress).includes(book.classId)
}

function freshDeck(book: CampaignClassBooks["books"][number], progress: ClassBookProgress, hasClass: boolean, classLevel: number): ClassBookDeck {
  const all = permittedBook(book, progress, hasClass, classLevel).entries.flatMap(entry =>
    Array.from({ length: entry.copies ?? 1 }, () => entry.id))
  return {
    drawPile: shuffle(all), hand: [], discardPile: [],
    poolSignature: classBookPoolSignature(book, progress, hasClass, classLevel),
  }
}

function currentDeck(book: CampaignClassBooks["books"][number], progress: ClassBookProgress, hasClass: boolean, classLevel: number, deck?: ClassBookDeck): ClassBookDeck {
  if (!deck) return freshDeck(book, progress, hasClass, classLevel)
  const reconciled = reconcileClassBookDeck(book, progress, hasClass, deck, classLevel)
  // Uma mudança na publicação/atribuição adiciona cartas; embaralhamos apenas
  // o monte de compra. A mão e o descarte existentes não são reiniciados.
  if (deck.poolSignature !== reconciled.poolSignature)
    reconciled.drawPile = shuffle(reconciled.drawPile)
  return reconciled
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await access(context)
  if (auth.error) return auth.error
  const { id, user, role } = auth
  const gm = role === "gm"
  const data = snapshot(id)
  const requested = new URL(request.url).searchParams.get("characterId")
  const character = requested ? isCharacterMember(id, user.id, requested, gm) : null
  if (requested && !character) return jsonError("Personagem não autorizado.", 403)
  if (!gm && !character) return jsonError("Informe seu personagem.", 400)

  const progress = character ? progressFor(data, character.id) : { subclassIds: [], granted: {} }
  const ids = character ? accessibleClassIds(character, progress) : []
  const definitions = allClasses(id)
  const levelFor = (book: CampaignClassBooks["books"][number]) =>
    character ? characterBookClassLevel(character, book.classId, progress, definitions) : 0
  // A mesma autorização vale para mestre e jogador quando o livro pertence a uma ficha.
  // Uma concessão explícita também funciona para quem não possui a classe do livro.
  const books = gm && !character
    ? data.books
    : data.books.filter((book) => canAccessBook(book, progress, ids.includes(book.classId), levelFor(book)))
      .map((book) => permittedBook(book, progress, ids.includes(book.classId), levelFor(book)))
  return NextResponse.json({
    serverNow: Date.now(),
    books,
    ...(character ? { characterClassLevels: {
      [character.id]: Object.fromEntries(definitions.map(def => [def.id, characterBookClassLevel(character, def.id, progress, definitions)])),
    } } : {}),
    classes: gm ? allClasses(id) : playerVisibleClassCatalog(allClasses(id), customDefinitions(id)),
    // O progresso privado pode conter IDs de cartas ainda acima do nível.
    // O jogador recebe apenas concessões que já constam dos livros filtrados.
    progress: { subclassIds: progress.subclassIds, granted: character
      ? Object.fromEntries(books.map(book => [book.id,
          (progress.granted[book.id] ?? []).filter(entryId => book.entries.some(entry => entry.id === entryId)),
        ]))
      : progress.granted },
    // Calculado sobre os livros COMPLETOS, antes do filtro de cartas autorizadas.
    // Apenas os totais numéricos chegam ao cliente; cartas desconhecidas não são expostas.
    ...(character ? {
      levelSummary: Object.fromEntries(books.filter(book => book.kind === "spellbook").map(book => {
        const original = data.books.find(item => item.id === book.id)!
        return [book.id, summarizeClassBookLevels(original, progress, ids.includes(book.classId), levelFor(original))]
      })),
      lorePoints: (character.resources as Character["resources"] & { lp?: number }).lp ?? 0,
    } : {}),
    // Mesmo antes da primeira compra, mostre o total correto de cartas acessíveis.
    // Para decks antigos, calcule a reconciliação sem escrever durante o GET.
    deckView: Object.fromEntries(character ? books.flatMap((book) => {
      if (book.kind !== "spellbook" || book.playMode === "gallery") return []
      const hasClass = ids.includes(book.classId)
      const level = levelFor(book)
      const savedDeck = progress.deck?.[book.id]
      const visible = savedDeck
        ? reconcileClassBookDeck(book, progress, hasClass, savedDeck, level)
        : {
            drawPile: permittedBook(book, progress, hasClass, level).entries.flatMap(entry =>
              Array.from({ length: entry.copies ?? 1 }, () => entry.id)),
            hand: [], discardPile: [],
          }
      return [[book.id, {
        drawCount: visible.drawPile.length, hand: visible.hand, discardPile: visible.discardPile,
        cooldownStartedAt: visible.cooldownStartedAt,
        cooldownUntil: visible.cooldownUntil,
      }]]
    }) : []),
    activity: gm && !character ? data.activity : data.activity.filter(item => item.characterId === character?.id),
    ...(gm ? {
      characterProgress: data.progress,
      characterClasses: Object.fromEntries(
        [...store.characters.values()]
          .filter(c => c.campaignId === id)
          .map(c => [c.id, characterClassIds(c)]),
      ),
      characterClassLevels: Object.fromEntries(
        [...store.characters.values()]
          .filter(c => c.campaignId === id)
          .map(c => [c.id, Object.fromEntries(definitions.map(def =>
            [def.id, characterBookClassLevel(c, def.id, progressFor(data, c.id), definitions)]))]),
      ),
    } : {}),
    revision: data.revision,
  })
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await access(context)
  if (auth.error) return auth.error
  const { id, user, role } = auth
  const gm = role === "gm"
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Dados inválidos.", 400)
  const action = body.action
  const bookId = body.bookId
  const characterId = body.characterId
  const entryId = body.entryId

  try {
    const result = await transactStore((draft): { value: ClassBookMutationResult; changed: boolean } => {
      const data: CampaignClassBooks = structuredClone(draft.classBooks.get(id) ?? emptyClassBooks())
      let activity: CampaignClassBooks["activity"][number] | null = null
      let learnedEntryId: string | null = null
      let changed = false

      if (action === "save-book") {
        if (!gm) throw new Error("Somente o mestre pode editar livros.")
        if (!Number.isSafeInteger(body.revision) || body.revision !== data.revision)
          throw new Error("Outro usuário alterou os livros. Atualize a página antes de salvar.")
        const book = validateBook(body.book)
        // Uma campanha é persistida em um documento Mongo (limite BSON de 16 MiB).
        if (JSON.stringify(book).length > 180_000)
          throw new Error("Livro muito grande. Reduza imagens/textos ou divida em volumes menores.")
        if (!allClasses(id).some((cls) => cls.id === book.classId)) throw new Error("Classe ou subclasse não encontrada.")
        const index = data.books.findIndex((item) => item.id === book.id)
        const previous = index >= 0 ? data.books[index] : undefined
        if (index >= 0) data.books[index] = book
        else data.books.push(book)
        // Reconciliar os decks somente quando a publicação, cópias ou
        // modo de acesso mudarem; editar descrição não reinicia a mão.
        const accessSignature = (b: typeof book | undefined) => b && JSON.stringify({
          classId: b.classId, unlockMode: b.unlockMode,
          entries: b.entries.map(e => [e.id, e.published, e.copies, e.requiredClassLevel ?? 1]),
        })
        if (previous && (accessSignature(previous) !== accessSignature(book) ||
            previous.cooldownSeconds !== book.cooldownSeconds)) {
          for (const [cid, progress] of Object.entries(data.progress)) {
            if (!progress.deck?.[book.id]) continue
            const owned = draft.characters.get(cid)
            const updated = currentDeck(book, progress, ownsBookClass(book, owned, progress), bookLevel(book, owned, progress, id), progress.deck[book.id])
            if (book.cooldownSeconds == null) {
              delete updated.cooldownStartedAt
              delete updated.cooldownUntil
            } else if (deckCycleExhausted(updated)) {
              const started = updated.cooldownStartedAt ?? Date.now()
              updated.cooldownStartedAt = started
              updated.cooldownUntil = started + book.cooldownSeconds * 1000
            }
            progress.deck[book.id] = updated
          }
        }
        // Revogar publicação também cancela os efeitos da carta, não apenas
        // a sua presença no grimório e no deck.
        if (previous) {
          const unpublished = previous.entries.filter(entry =>
            entry.published && !book.entries.some(now => now.id === entry.id && now.published))
          const prefixes = unpublished.map(entry => cardBonusPrefix(book.id, entry.id))
          if (prefixes.length) {
            for (const [cid, character] of draft.characters) {
              if (character.campaignId !== id) continue
              const mods = readCharacterModifiers(character)
              const kept = mods.filter(mod => !prefixes.some(prefix => mod.id?.startsWith(prefix)))
              if (kept.length !== mods.length)
                draft.characters.set(cid, updatedCharacterWithModifiers(character, kept))
            }
          }
        }
        if (data.books.length > 40) throw new Error("Limite de 40 livros por campanha excedido.")
        changed = true
      } else if (action === "delete-book") {
        if (!gm) throw new Error("Somente o mestre pode excluir livros.")
        if (!validId(bookId)) throw new Error("Livro inválido.")
        if (!Number.isSafeInteger(body.revision) || body.revision !== data.revision)
          throw new Error("Os livros foram alterados. Atualize antes de excluir.")
        const previousLength = data.books.length
        data.books = data.books.filter((book) => book.id !== bookId)
        if (previousLength === data.books.length) throw new Error("Livro não encontrado.")
        for (const progress of Object.values(data.progress)) {
          delete progress.granted[bookId]
          if (progress.deck) delete progress.deck[bookId]
        }
        changed = true
      } else if (["grant", "revoke", "grant-all", "revoke-all"].includes(String(action))) {
        if (!gm) throw new Error("Somente o mestre pode atribuir cartas.")
        if (!validId(bookId) || !validId(characterId) ||
          ((action === "grant" || action === "revoke") && !validId(entryId)))
          throw new Error("Identificadores inválidos.")
        const character = draft.characters.get(characterId)
        if (!character || character.campaignId !== id) throw new Error("Personagem não encontrado.")
        const book = data.books.find((item) => item.id === bookId)
        if (!book) throw new Error("Livro não encontrado.")
        const publishedEntries = book.entries.filter(e => e.published)
        const targetEntries = action === "grant-all" || action === "revoke-all"
          ? publishedEntries
          : publishedEntries.filter(e => e.id === entryId)
        if ((action === "grant" || action === "revoke") && targetEntries.length !== 1)
          throw new Error("Publique a carta antes de atribuí-la ao personagem.")
        const progress = data.progress[characterId] ?? { subclassIds: [], granted: {} }
        const granted = new Set(progress.granted[bookId] ?? [])
        const denied = new Set(progress.denied?.[bookId] ?? [])
        const granting = action === "grant" || action === "grant-all"
        for (const entry of targetEntries) {
          if (granting) { granted.add(entry.id); denied.delete(entry.id) }
          else { granted.delete(entry.id); denied.add(entry.id) }
        }
        const next: ClassBookProgress = {
          ...progress,
          granted: { ...progress.granted, [bookId]: [...granted] },
          denied: { ...(progress.denied ?? {}), [bookId]: [...denied] },
        }
        // Atribuição/revogação atualiza as cópias do baralho sem apagar cartas
        // ainda válidas da mão nem descartar todo o progresso do jogador.
        next.deck = { ...(progress.deck ?? {}),
          [bookId]: currentDeck(book, next, ownsBookClass(book, character, next), bookLevel(book, character, next, id), progress.deck?.[bookId]) }
        data.progress[characterId] = next
        if (!granting) {
          const prefixes = targetEntries.map(entry => cardBonusPrefix(bookId, entry.id))
          const current = readCharacterModifiers(character)
          const modifiers = current.filter(mod => !prefixes.some(prefix => mod.id?.startsWith(prefix)))
          if (modifiers.length !== current.length)
            draft.characters.set(character.id, updatedCharacterWithModifiers(character, modifiers))
        }
        changed = true
      } else if (action === "learn-card") {
        // Sorteio, permissão, débito de LP e concessão da carta ocorrem na MESMA
        // transação do armazenamento: requisições concorrentes não podem gastar
        // o mesmo ponto duas vezes.
        if (!validId(characterId) || !validId(bookId) ||
            typeof body.requestId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(body.requestId))
          throw new Error("Dados inválidos para o Aprendizado.")
        const character = draft.characters.get(characterId)
        if (!character || character.campaignId !== id || (!gm && character.ownerId !== user.id))
          throw new Error("Personagem não autorizado.")
        const progress = data.progress[characterId] ?? { subclassIds: [], granted: {} }
        // Conferir o recibo ANTES de verificar LP ou novas cartas candidatas.
        // Um cliente que perdeu a resposta pode enviar o MESMO requestId sem pagar de novo.
        const receipt = progress.learningReceipts?.[body.requestId]
        if (receipt) {
          if (receipt.bookId !== bookId)
            throw new Error("Identificador de Aprendizado já utilizado em outro grimório.")
          return {
            value: { activity: null, learnedEntryId: receipt.entryId,
              revision: data.revision, duplicate: true, changed: false },
            changed: false,
          }
        }
        const book = data.books.find(item => item.id === bookId)
        if (!book || book.kind !== "spellbook" || book.unlockMode !== "learn")
          throw new Error("Grimório indisponível para Aprendizado.")
        const hasClass = ownsBookClass(book, character, progress)
        const level = bookLevel(book, character, progress, id)
        const prepared = prepareClassBookLearning({
          book, progress, hasClassAccess: hasClass, classLevel: level,
          lorePoints: (character.resources as Character["resources"] & { lp?: number }).lp ?? 0,
        })
        learnedEntryId = prepared.entryId
        const next: ClassBookProgress = {
          ...prepared.nextProgress,
          learningReceipts: {
            ...(progress.learningReceipts ?? {}),
            [body.requestId]: { bookId, entryId: prepared.entryId },
          },
        }
        // Adiciona a carta recém-aprendida ao baralho sem reiniciar mão/descarte.
        // currentDeck reconcilia cópias e sorteia o monte somente se o pool mudou.
        if (book.playMode !== "gallery") {
          next.deck = {
            ...(progress.deck ?? {}),
            [bookId]: currentDeck(book, next, hasClass, level, progress.deck?.[bookId]),
          }
        }
        data.progress[characterId] = next
        draft.characters.set(characterId, updatedCharacterWithModifiers(
          character, readCharacterModifiers(character),
          { ...character.resources, lp: prepared.nextLorePoints } as Character["resources"],
        ))
        changed = true
      } else if (action === "adjust-lore") {
        // O mestre atribui/remaneja Lore no armazenamento, não por PATCH parcial.
        // A ficha só é atualizada no cliente após o servidor confirmar a mudança.
        if (!gm) throw new Error("Somente o mestre pode atribuir Pontos de Lore.")
        if (!validId(characterId) || (body.delta !== 1 && body.delta !== -1))
          throw new Error("Ajuste de Lore inválido.")
        const character = draft.characters.get(characterId)
        if (!character || character.campaignId !== id)
          throw new Error("Personagem não autorizado.")
        const current = (character.resources as Character["resources"] & { lp?: number }).lp ?? 0
        if (!Number.isSafeInteger(current) || current < 0 || current > 10000)
          throw new Error("Saldo de Lore inválido na ficha.")
        const nextLore = current + body.delta
        if (nextLore < 0 || nextLore > 10000)
          throw new Error("O saldo de Lore deve ficar entre 0 e 10000.")
        draft.characters.set(characterId, updatedCharacterWithModifiers(
          character, readCharacterModifiers(character),
          { ...character.resources, lp: nextLore } as Character["resources"],
        ))
        changed = true
      } else if (action === "upgrade-lore-modifier") {
        // Lore e modificador são alterados juntos; um erro nunca concede bônus grátis.
        if (!validId(characterId) || !validId(body.modifierId) ||
            typeof body.requestId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(body.requestId))
          throw new Error("Dados inválidos para melhoria com Lore.")
        const character = draft.characters.get(characterId)
        if (!character || character.campaignId !== id || (!gm && character.ownerId !== user.id))
          throw new Error("Personagem não autorizado.")
        type LoreProgress = ClassBookProgress & { loreUpgradeReceipts?: Record<string, string> }
        const progress: LoreProgress = data.progress[characterId] ?? { subclassIds: [], granted: {} }
        const previouslyUpgraded = progress.loreUpgradeReceipts?.[body.requestId]
        if (previouslyUpgraded) {
          if (previouslyUpgraded !== body.modifierId)
            throw new Error("Identificador de melhoria já utilizado para outro modificador.")
          return { value: { activity: null, learnedEntryId: null,
            revision: data.revision, duplicate: true, changed: false }, changed: false }
        }
        const current = (character.resources as Character["resources"] & { lp?: number }).lp ?? 0
        if (!Number.isSafeInteger(current) || current < 1)
          throw new Error("Pontos de Lore insuficientes.")
        const modifiers = readCharacterModifiers(character)
        const target = modifiers.find(mod => mod.id === body.modifierId)
        if (!target || target.type === "class_book_effect" || target.type === "bond" ||
            target.target === "sheet_defense_hidden" ||
            target.id?.startsWith("free_skill:") ||
            typeof target.value !== "number" || !Number.isSafeInteger(target.value) || target.value >= 1000)
          throw new Error("Este modificador não pode ser melhorado com Lore.")
        const updatedMods = modifiers.map(mod => mod.id === body.modifierId
          ? { ...mod, value: mod.value! + 1 } : mod)
        draft.characters.set(characterId, updatedCharacterWithModifiers(
          character, updatedMods, { ...character.resources, lp: current - 1 } as Character["resources"],
        ))
        data.progress[characterId] = {
          ...progress,
          loreUpgradeReceipts: { ...(progress.loreUpgradeReceipts ?? {}),
            [body.requestId]: body.modifierId },
        } as ClassBookProgress
        changed = true
      } else if (action === "select-subclass") {
        if (!validId(characterId) || !validId(body.subclassId)) throw new Error("Especialização inválida.")
        const character = draft.characters.get(characterId)
        if (!character || character.campaignId !== id || (!gm && character.ownerId !== user.id))
          throw new Error("Personagem não autorizado.")
        const subclasses = customDefinitions(id)
        const subclass = subclasses.find((item) => item.id === body.subclassId && item.parentClassId)
        if (!gm && !isClassAvailableToPlayers(body.subclassId, subclasses))
          throw new Error("Subclasse ainda não liberada pelo mestre.")
        if (!subclass?.parentClassId || !characterClassIds(character).includes(subclass.parentClassId))
          throw new Error("A subclasse não pertence às classes desse personagem.")
        const progress = data.progress[characterId] ?? { subclassIds: [], granted: {} }
        progress.subclassIds = progress.subclassIds.filter((subId) =>
          !subclasses.some((candidate) => candidate.id === subId && candidate.parentClassId === subclass.parentClassId))
        progress.subclassIds.push(subclass.id)
        data.progress[characterId] = progress
        changed = true
      } else if (action === "resolve-craft") {
        if (!gm) throw new Error("Somente o mestre pode aprovar projetos.")
        if (!validId(body.activityId) || !["approved", "rejected"].includes(body.status))
          throw new Error("Resolução inválida.")
        const request = data.activity.find(item => item.id === body.activityId && item.action === "craft-request")
        if (!request || request.status !== "pending") throw new Error("Pedido não encontrado ou já resolvido.")
        request.status = body.status
        changed = true
      } else if (action === "draw" || action === "reset-deck") {
        if (!validId(characterId) || !validId(bookId)) throw new Error("Personagem ou livro inválido.")
        const character = draft.characters.get(characterId)
        if (!character || character.campaignId !== id || (!gm && character.ownerId !== user.id))
          throw new Error("Personagem não autorizado.")
        const progress = data.progress[characterId] ?? { subclassIds: [], granted: {} }
        const book = data.books.find(item => item.id === bookId)
        if (!book || book.kind !== "spellbook" || book.playMode === "gallery" ||
          !canAccessBook(book, progress, ownsBookClass(book, character, progress), bookLevel(book, character, progress, id)))
          throw new Error("Deck indisponível.")
        const hasClass = ownsBookClass(book, character, progress)
        const classLevel = bookLevel(book, character, progress, id)
        const deck = currentDeck(book, progress, hasClass, classLevel, progress.deck?.[bookId])
        if (!permittedBook(book, progress, hasClass, classLevel).entries.length)
          throw new Error(book.unlockMode === "grant"
            ? "Nenhuma carta liberada: o mestre precisa atribuir as cartas publicadas a este personagem."
            : "Nenhuma carta disponível: publique cartas para a classe deste personagem ou peça uma atribuição individual.")
        if (action === "reset-deck") {
          if (book.cooldownSeconds != null) {
            if (!deckCycleExhausted(deck))
              throw new Error("Finalize todas as cartas do ciclo antes de reiniciar o grimório.")
            // Mesmo o mestre deve aguardar. A regra fica garantida no servidor.
            if (deckCooldownRemaining(deck) > 0)
              throw new Error("Cooldown ativo: aguarde antes de embaralhar e reiniciar.")
            if (!deck.cooldownUntil)
              throw new Error("Cooldown ainda não iniciado. Finalize a última carta do grimório.")
          } else if (!gm && book.allowPlayerReset !== true) {
            throw new Error("Somente o mestre pode reiniciar este deck.")
          }
          progress.deck = { ...progress.deck, [bookId]: freshDeck(book, progress, ownsBookClass(book, character, progress), classLevel) }
        } else {
          if (deck.hand.length >= (book.handLimit ?? 7)) throw new Error("Mão cheia. Jogue uma carta antes de comprar outra.")
          if (!deck.drawPile.length) throw new Error("Monte esgotado. Peça ao mestre para embaralhar/reiniciar o deck.")
          const drawn = deck.drawPile.shift()!
          deck.hand.push(drawn)
          progress.deck = { ...progress.deck, [bookId]: deck }
        }
        data.progress[characterId] = progress
        changed = true
      } else if (action === "expire-effects") {
        if (!validId(characterId)) throw new Error("Personagem inválido.")
        const character = draft.characters.get(characterId)
        if (!character || character.campaignId !== id || (!gm && character.ownerId !== user.id))
          throw new Error("Personagem não autorizado.")
        const current = readCharacterModifiers(character)
        const kept = activeClassBookModifiers(current)
        if (kept.length !== current.length) {
          draft.characters.set(characterId, updatedCharacterWithModifiers(character, kept))
          changed = true
        }
      } else if (action === "use-entry") {
        if (!validId(characterId) || !validId(bookId) || !validId(entryId) || !validId(body.requestId))
          throw new Error("Identificadores inválidos.")
        const character = draft.characters.get(characterId)
        if (!character || character.campaignId !== id || (!gm && character.ownerId !== user.id))
          throw new Error("Personagem não autorizado.")
        const progress = progressFor(data, characterId)
        const book = data.books.find((item) => item.id === bookId)
        // Idempotência antes da checagem de nível: uma conjuração já confirmada
        // continua reconhecível mesmo após a evolução da classe ou bloqueio da carta.
        const existing = data.activity.find((item) => item.id === body.requestId)
        if (existing) {
          if (existing.characterId !== characterId || existing.bookId !== bookId || existing.entryId !== entryId)
            throw new Error("Identificador de conjuração já utilizado por outra ação.")
          return { value: { activity: existing, learnedEntryId: null, revision: data.revision, duplicate: true, changed: false }, changed: false }
        }
        const level = book ? bookLevel(book, character, progress, id) : 0
        if (!book || !canAccessBook(book, progress, ownsBookClass(book, character, progress), level))
          throw new Error("Livro indisponível para o nível atual da classe.")
        const entry = permittedBook(book, progress, ownsBookClass(book, character, progress), level)
          .entries.find((item) => item.id === entryId)
        if (!entry) throw new Error("Carta indisponível: verifique a publicação, atribuição e o nível mínimo exigido da classe.")
        if (book.kind === "spellbook" && book.playMode !== "gallery") {
          const deck = progress.deck?.[bookId]
          if (!deck || !deck.hand.includes(entryId)) throw new Error("A carta precisa estar na sua mão para ser conjurada.")
        }
        const cost = book.kind === "spellbook" ? entry.cost : undefined
        // Salvamentos antigos podem conter "ip". Não consumimos capacidade de carga.
        if (cost?.resource === "ip") throw new Error("PI agora representa kg disponíveis. O mestre deve editar o custo desta magia para PV ou PM.")
        // Custo e aplicação do efeito fazem parte da MESMA transação do banco.
        // A ação duplicada é tratada acima, antes de cobrar ou ativar o efeito.
        const castAt = Date.now()
        const currentModifiers = readCharacterModifiers(character)
        const activeModifiers = activeClassBookModifiers(currentModifiers, castAt)
        const newBonuses = book.kind === "spellbook" ? cardBonusModifiers(book.id, entry, castAt) : []
        const bonusPrefix = cardBonusPrefix(book.id, entry.id)
        const nextModifiers = book.kind === "spellbook"
          ? [...activeModifiers.filter(m => !m.id?.startsWith(bonusPrefix)), ...newBonuses]
          : activeModifiers
        const resource = cost?.resource && cost.amount > 0
          ? (character.resources as unknown as Record<string, unknown>)[cost.resource]
          : undefined
        if (cost && cost.amount > 0) {
          if (typeof resource !== "number" || !Number.isFinite(resource))
            throw new Error("Esse recurso não está disponível na ficha do personagem.")
          if (resource < cost.amount || (cost.resource === "hp" && resource <= cost.amount))
            throw new Error("Recursos insuficientes para ativar a carta.")
        }
        if ((cost && cost.amount > 0) ||
            (book.kind === "spellbook" && (newBonuses.length > 0 || nextModifiers.length !== currentModifiers.length))) {
          const nextResources: Character["resources"] = cost && cost.amount > 0
            ? { ...character.resources, [cost.resource]: (resource as number) - cost.amount }
            : character.resources
          draft.characters.set(
            character.id,
            updatedCharacterWithModifiers(character, nextModifiers, nextResources),
          )
        }
        if (book.kind === "spellbook" && book.playMode !== "gallery") {
          const deck = progress.deck![bookId]
          deck.hand.splice(deck.hand.indexOf(entryId), 1)
          deck.discardPile.push(entryId)
          if (book.cooldownSeconds != null && deckCycleExhausted(deck)) {
            deck.cooldownStartedAt = castAt
            deck.cooldownUntil = castAt + book.cooldownSeconds * 1000
          }
          progress.deck![bookId] = deck
          data.progress[characterId] = progress
        }
        activity = {
          id: body.requestId, characterId, bookId, entryId,
          action: book.kind === "spellbook" ? "cast" : "craft-request",
          at: castAt,
          ...(book.kind === "blueprints" ? { status: "pending" as const } : {}),
          ...(cost ? { resource: cost.resource, spent: cost.amount } : {}),
        }
        data.activity = [...data.activity, activity].slice(-300)
        changed = true
      } else {
        throw new Error("Ação desconhecida.")
      }
      if (changed) {
        data.revision += 1
        draft.classBooks.set(id, data)
      }
      return { value: { activity, learnedEntryId, revision: data.revision, duplicate: false, changed }, changed }
    })
    if (result.changed) publish(id, { type: "class-books:updated" } as RealtimeEvent)
    // O grimório altera recursos da ficha em transação própria. Notifique
    // outras abas/jogadores da alteração confirmada, não só da revisão do livro.
    if (result.changed && validId(characterId) &&
        ["learn-card", "adjust-lore", "upgrade-lore-modifier"].includes(String(action))) {
      const updatedCharacter = store.characters.get(characterId)
      if (updatedCharacter)
        publish(id, { type: "character:updated", character: updatedCharacter } as RealtimeEvent)
    }
    if (result.activity && !result.duplicate && result.activity.action === "cast") {
      const latestBook = store.classBooks.get(id)?.books.find(book => book.id === result.activity?.bookId)
      const latestEntry = latestBook?.entries.find(entry => entry.id === result.activity?.entryId)
      const caster = store.characters.get(result.activity.characterId)
      publish(id, {
        type: "class-books:played",
        characterId: result.activity.characterId,
        bookId: result.activity.bookId,
        entryId: result.activity.entryId,
        action: "cast",
        casterName: caster?.name ?? "Viajante",
        cardName: latestEntry?.name ?? "Magia",
        cardImage: latestEntry?.imageUrl ?? null,
        cardEffects: latestEntry?.effects ?? "",
      } as unknown as RealtimeEvent)
    }
    return NextResponse.json({ success: true, ...result,
      ...(["expire-effects", "learn-card", "adjust-lore", "upgrade-lore-modifier"].includes(String(action)) && validId(characterId)
        ? { character: store.characters.get(characterId) } : {}),
      ...(result.activity && result.activity.action === "cast"
        ? { character: store.characters.get(result.activity.characterId) } : {}),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar o livro."
    return jsonError(message, /não autorizado|Somente|indisponível|bloqueado/.test(message) ? 403 : 400)
  }
}
