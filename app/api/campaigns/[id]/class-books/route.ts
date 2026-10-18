import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { CLASSES, type GameClass } from "@/lib/game-data"
import { getCampaignClassCatalog } from "@/lib/class-catalog"
import { isClassAvailableToPlayers, playerVisibleClassCatalog, type CustomClassVisibility } from "@/lib/class-visibility"
import {
  accessibleClassIds,
  characterClassIds,
  emptyClassBooks,
  permittedBook,
  progressFor,
  validateBook, 
  type CampaignClassBooks,
  type ClassBookDeck,
} from "@/lib/class-books"
import { getMemberRole, publish, store, transactStore } from "@/lib/store"
import type { RealtimeEvent } from "@/lib/types"
import { randomInt } from "node:crypto"

type RouteContext = { params: Promise<{ id: string }> }

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

function freshDeck(book: CampaignClassBooks["books"][number], progress: CampaignClassBooks["progress"][string]): ClassBookDeck {
  const all = permittedBook(book, progress).entries.flatMap(entry =>
    Array.from({ length: entry.copies ?? 1 }, () => entry.id))
  return { drawPile: shuffle(all), hand: [], discardPile: [] }
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
  const books = gm && !character
    ? data.books
    : data.books.filter((book) => ids.includes(book.classId))
      .map((book) => gm ? book : permittedBook(book, progress))
  return NextResponse.json({
    books,
    classes: gm ? allClasses(id) : playerVisibleClassCatalog(allClasses(id), customDefinitions(id)),
    progress: { subclassIds: progress.subclassIds, granted: progress.granted },
    deckView: Object.fromEntries(Object.entries(progress.deck ?? {}).map(([bookId, deck]) => [
      bookId, { drawCount: deck.drawPile.length, hand: deck.hand, discardPile: deck.discardPile },
    ])),
    activity: gm && !character ? data.activity : data.activity.filter(item => item.characterId === character?.id),
    ...(gm ? { characterProgress: data.progress } : {}),
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
    const result = await transactStore((draft) => {
      const data: CampaignClassBooks = structuredClone(draft.classBooks.get(id) ?? emptyClassBooks())
      let activity: CampaignClassBooks["activity"][number] | null = null
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
        if (index >= 0) data.books[index] = book
        else data.books.push(book)
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
      } else if (action === "grant" || action === "revoke") {
        if (!gm) throw new Error("Somente o mestre pode desbloquear cartas.")
        if (!validId(bookId) || !validId(entryId) || !validId(characterId)) throw new Error("Identificadores inválidos.")
        const character = draft.characters.get(characterId)
        if (!character || character.campaignId !== id) throw new Error("Personagem não encontrado.")
        const book = data.books.find((item) => item.id === bookId)
        if (!book?.entries.some((entry) => entry.id === entryId)) throw new Error("Carta não encontrada.")
        const progress = data.progress[characterId] ?? { subclassIds: [], granted: {} }
        const granted = new Set(progress.granted[bookId] ?? [])
        if (action === "grant") granted.add(entryId)
        else granted.delete(entryId)
        data.progress[characterId] = {
          ...progress, granted: { ...progress.granted, [bookId]: [...granted] },
          deck: { ...(progress.deck ?? {}), [bookId]: freshDeck(book, { ...progress, granted: { ...progress.granted, [bookId]: [...granted] } }) },
        }
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
          !accessibleClassIds(character, progress).includes(book.classId))
          throw new Error("Deck indisponível.")
        const deck = progress.deck?.[bookId] ?? freshDeck(book, progress)
        if (action === "reset-deck") {
          if (!gm && book.allowPlayerReset !== true) throw new Error("Somente o mestre pode reiniciar este deck.")
          progress.deck = { ...progress.deck, [bookId]: freshDeck(book, progress) }
        } else {
          if (deck.hand.length >= (book.handLimit ?? 7)) throw new Error("Mão cheia. Jogue uma carta antes de comprar outra.")
          if (!deck.drawPile.length) throw new Error("Deck vazio. Peça ao mestre para reiniciá-lo.")
          const drawn = deck.drawPile.shift()!
          deck.hand.push(drawn)
          progress.deck = { ...progress.deck, [bookId]: deck }
        }
        data.progress[characterId] = progress
        changed = true
      } else if (action === "use-entry") {
        if (!validId(characterId) || !validId(bookId) || !validId(entryId) || !validId(body.requestId))
          throw new Error("Identificadores inválidos.")
        const character = draft.characters.get(characterId)
        if (!character || character.campaignId !== id || (!gm && character.ownerId !== user.id))
          throw new Error("Personagem não autorizado.")
        const progress = progressFor(data, characterId)
        const book = data.books.find((item) => item.id === bookId)
        if (!book || !accessibleClassIds(character, progress).includes(book.classId)) throw new Error("Livro indisponível.")
        const entry = permittedBook(book, progress).entries.find((item) => item.id === entryId)
        if (!entry) throw new Error("Carta ou projeto bloqueado.")
        const existing = data.activity.find((item) => item.id === body.requestId)
        if (existing) return { value: { activity: existing, revision: data.revision, duplicate: true }, changed: false }
        if (book.kind === "spellbook" && book.playMode !== "gallery") {
          const deck = progress.deck?.[bookId]
          if (!deck || !deck.hand.includes(entryId)) throw new Error("A carta precisa estar na sua mão para ser conjurada.")
        }
        const cost = book.kind === "spellbook" ? entry.cost : undefined
        // Salvamentos antigos podem conter "ip". Não consumimos capacidade de carga.
        if (cost?.resource === "ip") throw new Error("PI agora representa kg disponíveis. O mestre deve editar o custo desta magia para PV ou PM.")
        if (cost && cost.amount > 0) {
          const resource = (character.resources as unknown as Record<string, unknown>)[cost.resource]
          if (typeof resource !== "number" || !Number.isFinite(resource))
            throw new Error("Esse recurso não está disponível na ficha do personagem.")
          if (resource < cost.amount || (cost.resource === "hp" && resource <= cost.amount))
            throw new Error("Recursos insuficientes para ativar a carta.")
          const updated = {
            ...character,
            resources: { ...character.resources, [cost.resource]: resource - cost.amount },
            updatedAt: Math.max(Date.now(), Number(character.updatedAt || 0) + 1),
          }
          draft.characters.set(character.id, updated)
        }
        if (book.kind === "spellbook" && book.playMode !== "gallery") {
          const deck = progress.deck![bookId]
          deck.hand.splice(deck.hand.indexOf(entryId), 1)
          deck.discardPile.push(entryId)
          progress.deck![bookId] = deck
          data.progress[characterId] = progress
        }
        activity = {
          id: body.requestId, characterId, bookId, entryId,
          action: book.kind === "spellbook" ? "cast" : "craft-request",
          at: Date.now(),
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
      return { value: { activity, revision: data.revision, duplicate: false }, changed }
    })
    if (!result.duplicate) publish(id, { type: "class-books:updated" } as RealtimeEvent)
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
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao atualizar o livro."
    return jsonError(message, /não autorizado|Somente|indisponível|bloqueado/.test(message) ? 403 : 400)
  }
}
