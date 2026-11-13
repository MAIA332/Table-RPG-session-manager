import "server-only"
import type { CombatSession } from "./combat-types"
import type {
  Campaign,
  Character,
  RealtimeEvent,
  SessionToken,
  User,
  PersonalNote,
} from "./types"
import type { GameMap } from "@/lib/map-types"
import type { CampaignClassBooks } from "./class-books"
import { campaignItemCatalog, enforceInventoryDatabase } from "./inventory-server"
import { applyInventoryRules } from "./character"
import { readCampaignInventoryRules } from "./inventory-weight"
import { getMongoDb } from "./mongodb"
import type { AnyBulkWriteOperation, Collection } from "mongodb"
import { notifyCombatStorageChanged } from "./combat-file-notifications"

type Subscriber = (event: RealtimeEvent) => void
type PresenceSubscriber = (snapshot: Record<string, number>) => void
type PresenceConnection = {
  campaignId: string
  userId: string
  registrationId: string
}
type PersonalNotesRecord = {
  notes: PersonalNote[]
  flowcharts?: import("./types").PersonalFlowchart[]
  updatedAt: number
}

export interface CampaignSound {
  id: string
  trackId: string
  url: string
  loop: boolean
  targetUserId?: string | null
}

interface StoreShape {
  users: Map<string, User>
  sessions: Map<string, SessionToken>
  campaigns: Map<string, Campaign>
  characters: Map<string, Character>
  characterTombstones: Map<string, number>
  maps: Map<string, GameMap>
  lore: Map<string, any[]>
  combatSessions: Map<string, CombatSession>
  campaignState: Map<string, Record<string, unknown>>
  classBooks: Map<string, CampaignClassBooks>
  personalNotes: Map<string, PersonalNotesRecord>
  activeSounds: Map<string, CampaignSound[]>
  subscribers: Map<string, Set<Subscriber>>
  presence: Map<string, Map<string, number>>
  presenceConnections: Map<string, PresenceConnection>
  releasedPresenceConnections: Map<string, number>
  presenceSubscribers: Set<PresenceSubscriber>
}

// Cada imagem passa a ser um documento independente de campanha.
// NUNCA incluir os dados base64 completos no documento campaignState.
const PERSISTED_COLLECTIONS = [
  "galleryImages",
  "users",
  "sessions",
  "campaigns",
  "characters",
  "characterTombstones",
  "maps",
  "lore",
  "combatSessions",
  "campaignState",
  "classBooks",
  "personalNotes",
] as const

type PersistedCollection = (typeof PERSISTED_COLLECTIONS)[number]
type PersistedSnapshot = Record<PersistedCollection, Map<string, unknown>>

type MongoStoreDocument = {
  _id: string
  collection: PersistedCollection
  key: string
  value: unknown
}

/** Persistido em vtt_store, um documento por imagem; a API antiga não muda. */
type GalleryImageDocument = {
  campaignId: string
  imageId: string
  image: Record<string, unknown>
}

function storedImage(value: unknown): GalleryImageDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Partial<GalleryImageDocument>
  if (typeof record.campaignId !== "string" || !record.campaignId ||
      typeof record.imageId !== "string" || !record.imageId ||
      !record.image || typeof record.image !== "object" || Array.isArray(record.image) ||
      (record.image as Record<string, unknown>).id !== record.imageId) return null
  return record as GalleryImageDocument
}

function galleryImageKey(campaignId: string, imageId: string): string {
  return `${campaignId}:${imageId}`
}

function readGalleryId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const id = (value as Record<string, unknown>).id
  return typeof id === "string" && id.length > 0 ? id : null
}

/**
 * Reconstitui o formato legado em memória (state.gallery: image[]), sem reintroduzir
 * a lista no documento BSON. galleryOrder mantém a ordem sem carregar base64.
 */
function hydrateGallery(
  states: Map<string, Record<string, unknown>>,
  documents: Map<string, unknown>,
): void {
  const groups = new Map<string, Map<string, Record<string, unknown>>>()
  for (const value of documents.values()) {
    const doc = storedImage(value)
    if (!doc) continue
    let group = groups.get(doc.campaignId)
    if (!group) { group = new Map(); groups.set(doc.campaignId, group) }
    group.set(doc.imageId, doc.image)
  }
  for (const [campaignId, group] of groups) {
    const state = states.get(campaignId) || {}
    // A ordem é autoritativa para evitar ressuscitar exclusões parcialmente gravadas.
    const order = Array.isArray(state.galleryOrder)
      ? state.galleryOrder.filter((id): id is string => typeof id === "string")
      : [...group.keys()]
    state.gallery = order.flatMap(id => {
      const image = group.get(id)
      return image ? [image] : []
    })
    states.set(campaignId, state)
  }
  // Campanhas sem imagens permanecem com o comportamento original.
}

const MONGO_COLLECTION =
  process.env.MONGODB_COLLECTION?.trim() || "vtt_store"

function createEmptyStore(): StoreShape {
  return {
    users: new Map(),
    sessions: new Map(),
    campaigns: new Map(),
    characters: new Map(),
    characterTombstones: new Map(),
    maps: new Map(),
    lore: new Map(),
    combatSessions: new Map(),
    campaignState: new Map(),
    classBooks: new Map(),
    personalNotes: new Map(),
    activeSounds: new Map(),
    subscribers: new Map(),
    presence: new Map(),
    presenceConnections: new Map(),
    releasedPresenceConnections: new Map(),
    presenceSubscribers: new Set(),
  }
}

function cloneValue<T>(value: T): T {
  return structuredClone(value)
}

function cloneMap<T>(source: Map<string, T>): Map<string, T> {
  return new Map(
    [...source.entries()].map(([key, value]) => [key, cloneValue(value)] as [string, T]),
  )
}

function characterTimestamp(character: Character): number {
  return Math.max(
    Number(character.updatedAt) || 0,
    Number(character.createdAt) || 0,
  )
}

function createEmptySnapshot(): PersistedSnapshot {
  return {
    galleryImages: new Map(),
    users: new Map(),
    sessions: new Map(),
    campaigns: new Map(),
    characters: new Map(),
    characterTombstones: new Map(),
    maps: new Map(),
    lore: new Map(),
    combatSessions: new Map(),
    campaignState: new Map(),
    classBooks: new Map(),
    personalNotes: new Map(),
  }
}

function snapshotFromStore(storeData: StoreShape): PersistedSnapshot {
  const lore = cloneMap(storeData.lore)
  const campaignState = cloneMap(storeData.campaignState)
  const galleryImages = new Map<string, unknown>()
  for (const [campaignId, raw] of storeData.campaignState) {
    if (Array.isArray(raw.lore)) lore.set(campaignId, cloneValue(raw.lore))
    const clean = campaignState.get(campaignId)!
    // gallery é sempre uma coleção de documentos individuais. A ordem (IDs)
    // permanece no estado leve e NÃO carrega URLs ou arquivos em base64.
    if (Array.isArray(raw.gallery)) {
      const order: string[] = []
      const seen = new Set<string>()
      for (const value of raw.gallery) {
        const id = readGalleryId(value)
        if (!id) throw new Error(`Imagem sem ID válido na galeria da campanha ${campaignId}. Migração interrompida para proteger os dados.`)
        if (seen.has(id)) throw new Error(`ID de imagem duplicado na campanha ${campaignId}: ${id}`)
        seen.add(id)
        order.push(id)
        galleryImages.set(galleryImageKey(campaignId, id), {
          campaignId, imageId: id, image: cloneValue(value as Record<string, unknown>),
        } satisfies GalleryImageDocument)
      }
      clean.galleryOrder = order
    }
    // Se não houve modificação explícita da galeria, preservar a ordem anterior.
    delete clean.gallery
  }

  return {
    galleryImages,
    users: cloneMap(storeData.users),
    sessions: cloneMap(storeData.sessions),
    campaigns: cloneMap(storeData.campaigns),
    characters: cloneMap(storeData.characters),
    characterTombstones: cloneMap(storeData.characterTombstones),
    maps: cloneMap(storeData.maps),
    lore,
    combatSessions: cloneMap(storeData.combatSessions),
    campaignState,
    classBooks: cloneMap(storeData.classBooks),
    personalNotes: cloneMap(storeData.personalNotes),
  }
}

function storeFromSnapshot(snapshot: PersistedSnapshot): StoreShape {
  const next = createEmptyStore()
  next.users = cloneMap(snapshot.users as Map<string, User>)
  next.sessions = cloneMap(snapshot.sessions as Map<string, SessionToken>)
  next.campaigns = cloneMap(snapshot.campaigns as Map<string, Campaign>)
  next.characters = cloneMap(snapshot.characters as Map<string, Character>)
  next.characterTombstones = cloneMap(snapshot.characterTombstones as Map<string, number>)
  next.maps = cloneMap(snapshot.maps as Map<string, GameMap>)
  next.lore = cloneMap(snapshot.lore as Map<string, any[]>)
  next.combatSessions = cloneMap(snapshot.combatSessions as Map<string, CombatSession>)
  next.classBooks = cloneMap(snapshot.classBooks as Map<string, CampaignClassBooks>)
  next.campaignState = cloneMap(
    snapshot.campaignState as Map<string, Record<string, unknown>>,
  )
  next.personalNotes = cloneMap(
    snapshot.personalNotes as Map<string, PersonalNotesRecord>,
  )
  hydrateGallery(next.campaignState, snapshot.galleryImages)
  return next
}

function replacePersistedMaps(target: StoreShape, source: StoreShape): void {
  target.users = source.users
  target.sessions = source.sessions
  target.campaigns = source.campaigns
  target.characters = source.characters
  target.characterTombstones = source.characterTombstones
  target.maps = source.maps
  target.lore = source.lore
  target.combatSessions = source.combatSessions
  target.campaignState = source.campaignState
  target.classBooks = source.classBooks
  target.personalNotes = source.personalNotes
}

function equivalent(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

function mongoDocumentId(collection: PersistedCollection, key: string): string {
  return `${collection}:${key}`
}

async function ensureMongoCollection(): Promise<Collection<MongoStoreDocument>> {
  const db = await getMongoDb()
  return db.collection<MongoStoreDocument>(MONGO_COLLECTION)
}

async function loadFromMongo(): Promise<StoreShape> {
  const collection = await ensureMongoCollection()
  const docs = await collection.find({}).toArray()
  const loaded = createEmptyStore()
  const galleryDocs = new Map<string, unknown>()

  for (const doc of docs) {
    if (!PERSISTED_COLLECTIONS.includes(doc.collection)) continue
    if (typeof doc.key !== "string") continue
    if (doc.collection === "galleryImages") {
      const stored = storedImage(doc.value)
      if (stored) galleryDocs.set(doc.key, cloneValue(stored))
      continue
    }
    const target = loaded[doc.collection] as Map<string, unknown>
    target.set(doc.key, cloneValue(doc.value))
  }

  // Migração conservadora: inserir/verificar todas as imagens como documentos
  // individuais ANTES de apagar o array antigo do documento da campanha.
  for (const [campaignId, state] of loaded.campaignState) {
    if (!Array.isArray(state.gallery)) continue
    const legacy = state.gallery as unknown[]
    const legacyIds: string[] = []
    const seen = new Set<string>()
    for (const image of legacy) {
      const id = readGalleryId(image)
      if (!id || seen.has(id)) {
        throw new Error(`Migração da galeria ${campaignId} interrompida: imagens sem ID ou duplicadas. Dados antigos preservados.`)
      }
      seen.add(id)
      legacyIds.push(id)
    }

    // Documentos já separados prevalecem sobre cópias legadas desatualizadas.
    // $setOnInsert permite retomar uma migração interrompida sem reverter edições.
    const existingIds = new Set<string>()
    for (const value of galleryDocs.values()) {
      const doc = storedImage(value)
      if (doc?.campaignId === campaignId) existingIds.add(doc.imageId)
    }
    const order = [...legacyIds, ...[...existingIds].filter(id => !seen.has(id))]
    let batch: AnyBulkWriteOperation<MongoStoreDocument>[] = []
    let batchBytes = 0
    const flush = async () => {
      if (!batch.length) return
      await collection.bulkWrite(batch, { ordered: true })
      batch = []
      batchBytes = 0
    }
    for (const image of legacy) {
      const id = readGalleryId(image)!
      const key = galleryImageKey(campaignId, id)
      const wrapper: GalleryImageDocument = {
        campaignId, imageId: id, image: image as Record<string, unknown>,
      }
      if (!galleryDocs.has(key)) {
        const estimated = JSON.stringify(wrapper).length
        if (estimated > 12_000_000)
          throw new Error(`Imagem ${id} muito grande para migração individual. Documento original preservado.`)
        if (batch.length >= 30 || batchBytes + estimated > 5_000_000) await flush()
        batch.push({ updateOne: {
          filter: { _id: mongoDocumentId("galleryImages", key) },
          update: { $setOnInsert: { collection: "galleryImages", key, value: wrapper } },
          upsert: true,
        } })
        batchBytes += estimated
        galleryDocs.set(key, cloneValue(wrapper))
      }
    }
    await flush()

    // Conferir a existência e identidade dos registros antes de remover o legado.
    // A projeção não carrega novamente os arquivos base64 através da rede.
    const keys = legacyIds.map(id => mongoDocumentId("galleryImages", galleryImageKey(campaignId, id)))
    for (let index = 0; index < keys.length; index += 80) {
      const chunk = keys.slice(index, index + 80)
      const persisted = await collection.find(
        { _id: { $in: chunk } },
        { projection: { _id: 1, "value.campaignId": 1, "value.imageId": 1, "value.image.id": 1 } },
      ).toArray()
      const verified = new Set(persisted.filter(doc => {
        const value = storedImage(doc.value)
        return value?.campaignId === campaignId
      }).map(doc => doc._id))
      if (chunk.some(key => !verified.has(key))) {
        throw new Error(`Migração incompleta da galeria ${campaignId}. Documentos antigos mantidos para segurança.`)
      }
    }

    // Somente após os upserts confirmados retiramos o payload pesado do legado.
    // O update é atômico no documento da campanha. Se falhar, o array legado
    // continua lá; a migração poderá ser executada de novo no próximo boot.
    await collection.updateOne(
      { _id: mongoDocumentId("campaignState", campaignId), "value.gallery": { $exists: true } },
      { $set: { "value.galleryOrder": order }, $unset: { "value.gallery": "" } },
    )
    state.galleryOrder = order
    delete state.gallery
  }

  hydrateGallery(loaded.campaignState, galleryDocs)
  return loaded
}

async function persistSnapshot(
  snapshot: PersistedSnapshot,
  previous: PersistedSnapshot,
): Promise<boolean> {
  const collection = await ensureMongoCollection()
  const galleryUpserts: AnyBulkWriteOperation<MongoStoreDocument>[] = []
  const regularUpdates: AnyBulkWriteOperation<MongoStoreDocument>[] = []
  const galleryDeletes: AnyBulkWriteOperation<MongoStoreDocument>[] = []
  let changed = false

  for (const collectionName of PERSISTED_COLLECTIONS) {
    const current = snapshot[collectionName]
    const previousMap = previous[collectionName]
    for (const [key, value] of current) {
      if (previousMap.has(key) && equivalent(previousMap.get(key), value)) continue
      changed = true
      const update: AnyBulkWriteOperation<MongoStoreDocument> = {
        updateOne: {
          filter: { _id: mongoDocumentId(collectionName, key) },
          update: { $set: { collection: collectionName, key, value: cloneValue(value) } },
          upsert: true,
        },
      }
      if (collectionName === "galleryImages") galleryUpserts.push(update)
      else regularUpdates.push(update)
    }
    for (const key of previousMap.keys()) {
      if (current.has(key)) continue
      changed = true
      const deletion: AnyBulkWriteOperation<MongoStoreDocument> = {
        deleteOne: { filter: { _id: mongoDocumentId(collectionName, key) } },
      }
      if (collectionName === "galleryImages") galleryDeletes.push(deletion)
      else regularUpdates.push(deletion)
    }
  }

  if (!changed) return false
  // A ordem é essencial para migrações e edições concorrentes:
  // (1) garantir imagens -> (2) salvar lista leve de IDs -> (3) apagar imagens
  // que já não aparecem nessa lista. Não usar ordered:false neste protocolo.
  if (galleryUpserts.length) await collection.bulkWrite(galleryUpserts, { ordered: true })
  if (regularUpdates.length) await collection.bulkWrite(regularUpdates, { ordered: true })
  if (galleryDeletes.length) await collection.bulkWrite(galleryDeletes, { ordered: true })
  return true
}

const globalForStore = globalThis as unknown as {
  __vttStore?: StoreShape
  __vttStoreReady?: Promise<void>
  __vttPersistedSnapshot?: PersistedSnapshot
  __vttPersistenceQueue?: Promise<void>
}

export const store: StoreShape =
  globalForStore.__vttStore ?? createEmptyStore()

globalForStore.__vttStore = store

async function initializeStore(): Promise<void> {
  const loaded = await loadFromMongo()
  replacePersistedMaps(store, loaded)
  globalForStore.__vttPersistedSnapshot = snapshotFromStore(store)
}

if (!globalForStore.__vttStoreReady) {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    globalForStore.__vttStoreReady = Promise.resolve()
  } else {
    globalForStore.__vttStoreReady = initializeStore().catch((error) => {
      globalForStore.__vttStoreReady = undefined
      throw error
    })
  }
}

void globalForStore.__vttStoreReady

// Compatibilidade com HMR: versões anteriores do store não tinham classBooks.
if (!store.classBooks) store.classBooks = new Map()
if (globalForStore.__vttPersistedSnapshot && !globalForStore.__vttPersistedSnapshot.classBooks)
  globalForStore.__vttPersistedSnapshot.classBooks = new Map()
if (!globalForStore.__vttPersistedSnapshot)
  globalForStore.__vttPersistedSnapshot = snapshotFromStore(store)

if (!store.combatSessions) store.combatSessions = new Map()
if (!store.maps) store.maps = new Map()
if (!store.lore) store.lore = new Map()
if (!store.campaignState) store.campaignState = new Map()
if (!store.classBooks) store.classBooks = new Map()
if (!store.personalNotes) store.personalNotes = new Map()
if (!store.activeSounds) store.activeSounds = new Map()
if (!store.characterTombstones) store.characterTombstones = new Map()
if (!store.presence) store.presence = new Map()
if (!store.presenceConnections) store.presenceConnections = new Map()
if (!store.releasedPresenceConnections)
  store.releasedPresenceConnections = new Map()
if (!store.presenceSubscribers) store.presenceSubscribers = new Set()

globalForStore.__vttStore = store

function enqueuePersistence<T>(task: () => Promise<T>): Promise<T> {
  const queue = globalForStore.__vttPersistenceQueue ?? Promise.resolve()
  const operation = queue.then(task)
  globalForStore.__vttPersistenceQueue = operation.then(
    () => undefined,
    () => undefined,
  )
  return operation
}

export async function saveToDisk(storeData: StoreShape): Promise<void> {
  // Construir o snapshot DENTRO da fila. Caso contrário, uma gravação geral
  // enfileirada durante um ajuste rápido de HP/MP poderia carregar recursos
  // antigos e sobrescrever a atualização já confirmada no MongoDB.
  await enqueuePersistence(async () => {
    const previous = globalForStore.__vttPersistedSnapshot ?? createEmptySnapshot()
    const previousStore = storeFromSnapshot(previous)
    try {
      enforceInventoryDatabase(storeData, previousStore)
    } catch (error) {
      storeData.characters = previousStore.characters
      storeData.campaignState = previousStore.campaignState
      storeData.lore = previousStore.lore
      throw error
    }
    const snapshot = snapshotFromStore(storeData)
    const changed = await persistSnapshot(snapshot, previous)
    if (changed) {
      globalForStore.__vttPersistedSnapshot = snapshot
      notifyCombatStorageChanged()
    }
  })
}

export function deleteCharacterFromStore(characterId: string): void {
  const character = store.characters.get(characterId)
  const deletedAt = Math.max(
    Date.now(),
    character ? characterTimestamp(character) + 1 : 0,
  )
  store.characters.delete(characterId)
  store.characterTombstones.set(characterId, deletedAt)
}

export function genId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

export function subscribe(campaignId: string, fn: Subscriber): () => void {
  let set = store.subscribers.get(campaignId)
  if (!set) {
    set = new Set()
    store.subscribers.set(campaignId, set)
  }
  set.add(fn)
  return () => {
    set?.delete(fn)
  }
}

export function publish(campaignId: string, event: RealtimeEvent): void {
  const set = store.subscribers.get(campaignId)
  if (!set) return
  for (const fn of set) {
    try {
      fn(event)
    } catch {}
  }
}

// O mestre recebe a lista para gerenciamento; o player recebe somente o que pode ouvir.
export function getVisibleSounds(
  campaignId: string,
  userId: string,
): CampaignSound[] {
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return []

  const role = getMemberRole(campaign, userId)
  if (!role) return []

  const sounds = store.activeSounds.get(campaignId) || []

  return sounds.filter(
    (sound) =>
      role === "gm" || sound.targetUserId == null || sound.targetUserId === userId,
  )
}

export function notifySoundsChanged(campaignId: string): void {
  publish(campaignId, { type: "sound:changed" } as unknown as RealtimeEvent)
}

export function getCampaignPresenceCount(campaignId: string): number {
  return store.presence.get(campaignId)?.size ?? 0
}

export function getPresenceSnapshot(): Record<string, number> {
  return Object.fromEntries(
    [...store.presence.entries()].map(([campaignId, users]) => [
      campaignId,
      users.size,
    ]),
  )
}

function notifyPresence(campaignId: string): void {
  publish(campaignId, {
    type: "presence:updated",
    activeCount: getCampaignPresenceCount(campaignId),
  })
  const snapshot = getPresenceSnapshot()
  for (const fn of store.presenceSubscribers) {
    try {
      fn(snapshot)
    } catch {}
  }
}

function removePresenceConnection(
  connectionId: string,
  registrationId?: string,
): boolean {
  const connection = store.presenceConnections.get(connectionId)
  if (
    !connection ||
    (registrationId && connection.registrationId !== registrationId)
  )
    return false
  store.presenceConnections.delete(connectionId)

  const currentUsers = store.presence.get(connection.campaignId)
  if (!currentUsers) return false
  const connections = (currentUsers.get(connection.userId) ?? 1) - 1
  if (connections > 0) currentUsers.set(connection.userId, connections)
  else currentUsers.delete(connection.userId)
  if (currentUsers.size === 0) store.presence.delete(connection.campaignId)
  notifyPresence(connection.campaignId)
  return true
}

function pruneReleasedPresenceConnections(): void {
  const now = Date.now()
  for (const [connectionId, expiresAt] of store.releasedPresenceConnections) {
    if (expiresAt <= now) store.releasedPresenceConnections.delete(connectionId)
  }
}

export function releaseCampaignPresence(
  campaignId: string,
  userId: string,
  connectionId: string,
): void {
  pruneReleasedPresenceConnections()
  const connection = store.presenceConnections.get(connectionId)
  if (
    !connection ||
    (connection.campaignId === campaignId && connection.userId === userId)
  ) {
    if (connection)
      removePresenceConnection(connectionId, connection.registrationId)
    store.releasedPresenceConnections.set(connectionId, Date.now() + 60_000)
  }
}

export function registerCampaignPresence(
  campaignId: string,
  userId: string,
  connectionId = genId("presence"),
): () => void {
  pruneReleasedPresenceConnections()
  if (store.releasedPresenceConnections.has(connectionId)) return () => {}

  const previousConnection = store.presenceConnections.get(connectionId)
  if (previousConnection)
    removePresenceConnection(connectionId, previousConnection.registrationId)

  let users = store.presence.get(campaignId)
  if (!users) {
    users = new Map()
    store.presence.set(campaignId, users)
  }
  const registrationId = genId("presence-registration")
  store.presenceConnections.set(connectionId, {
    campaignId,
    userId,
    registrationId,
  })
  users.set(userId, (users.get(userId) ?? 0) + 1)
  notifyPresence(campaignId)

  let active = true
  return () => {
    if (!active) return
    active = false
    removePresenceConnection(connectionId, registrationId)
  }
}

export function subscribeToPresence(fn: PresenceSubscriber): () => void {
  store.presenceSubscribers.add(fn)
  return () => {
    store.presenceSubscribers.delete(fn)
  }
}

export function getCampaignCharacters(campaignId: string): Character[] {
  return [...store.characters.values()]
    .filter((c) => c.campaignId === campaignId)
    .map((character) =>
      applyInventoryRules(character, campaignItemCatalog(store, campaignId),
        readCampaignInventoryRules(store.campaignState.get(campaignId)?.inventoryRules)),
    )
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function getUserCampaigns(userId: string): Campaign[] {
  return [...store.campaigns.values()]
    .filter((c) => c.members.some((m) => m.userId === userId))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function findCampaignByCode(code: string): Campaign | undefined {
  const upper = code.trim().toUpperCase()
  return [...store.campaigns.values()].find((c) => c.code === upper)
}

export function getMemberRole(campaign: Campaign, userId: string) {
  return campaign.members.find((m) => m.userId === userId)?.role
}

/**
 * Executa uma transação síncrona sobre um snapshot do estado persistido e
 * aguarda a gravação no MongoDB antes de retornar o valor da transação.
 */
export function transactStore<T>(
  callback: (draft: StoreShape) => { value: T; changed: boolean },
): Promise<T> {
  return enqueuePersistence(async () => {
    const draft = storeFromSnapshot(snapshotFromStore(store))
    const result = callback(draft)
    if (result && typeof (result as any).then === "function")
      throw new Error("Transação assíncrona não permitida")

    if (result.changed) {
      const previous = globalForStore.__vttPersistedSnapshot ?? createEmptySnapshot()
      const previousStore = storeFromSnapshot(previous)
      try {
        enforceInventoryDatabase(draft, previousStore)
      } catch (error) {
        throw error
      }

      const snapshot = snapshotFromStore(draft)
      replacePersistedMaps(store, draft)
      await persistSnapshot(snapshot, previous)
      globalForStore.__vttPersistedSnapshot = snapshot
      notifyCombatStorageChanged()
    }

    return result.value
  })
}

/** Ajuste de vitalidade aceito pela rota rápida e validado no servidor. */
export type CharacterVitalChange = {
  mode: "delta" | "max" | "min"
  amount: number
}

/**
 * Atualiza HP/MP usando $set com expressões atômicas no documento do personagem.
 * NÃO clona o store completo nem a galeria a cada clique. A operação usa a
 * mesma fila das demais transações e atualiza somente a entrada de personagem
 * no snapshot persistido; assim, saves futuros não revertem os novos valores.
 *
 * delta => soma/subtrai do VALOR ATUAL NO BANCO, não de um estado antigo do React.
 * max/min => define o limite com possibilidade de offset, sempre com clamp.
 */
export async function applyCharacterVitalChanges(
  characterId: string,
  changes: Partial<Record<"hp" | "mp", CharacterVitalChange>>,
): Promise<Character> {
  await globalForStore.__vttStoreReady
  return enqueuePersistence(async () => {
    const known = store.characters.get(characterId)
    if (!known) throw new Error("Personagem não encontrado.")
    const operations = Object.entries(changes) as Array<["hp" | "mp", CharacterVitalChange]>
    if (!operations.length) return known

    const fields: Record<string, unknown> = {}
    for (const [key, change] of operations) {
      if (!change || !["delta", "max", "min"].includes(change.mode) ||
          !Number.isSafeInteger(change.amount) || Math.abs(change.amount) > 1_000_000) {
        throw new Error("Ajuste de HP/MP inválido.")
      }
      const limit = key === "hp" ? "maxHp" : "maxMp"
      const maximum = { $max: [0, { $ifNull: [`$value.resources.${limit}`, 0] }] }
      const base = change.mode === "delta"
        ? { $ifNull: [`$value.resources.${key}`, 0] }
        : change.mode === "max" ? maximum : { $min: [1, maximum] }
      fields[`value.resources.${key}`] = {
        $min: [maximum, { $max: [0, { $add: [base, change.amount] }] }],
      }
    }
    const now = Date.now()
    fields["value.updatedAt"] = {
      $max: [now, { $add: [{ $ifNull: ["$value.updatedAt", 0] }, 1] }],
    }
    const collection = await ensureMongoCollection()
    const saved = await collection.findOneAndUpdate(
      { _id: mongoDocumentId("characters", characterId), collection: "characters" },
      [{ $set: fields }],
      { returnDocument: "after" },
    )
    if (!saved || !saved.value || typeof saved.value !== "object") {
      throw new Error("Personagem não encontrado no MongoDB.")
    }
    const updated = saved.value as Character
    if (!updated.resources || !Number.isFinite(updated.resources.hp) || !Number.isFinite(updated.resources.mp)) {
      throw new Error("O MongoDB retornou recursos inválidos.")
    }
    store.characters.set(characterId, updated)
    // Sem snapshotFromStore(): clona APENAS este personagem, nunca a galeria.
    globalForStore.__vttPersistedSnapshot?.characters.set(characterId, cloneValue(updated))
    notifyCombatStorageChanged()
    return updated
  })
}
