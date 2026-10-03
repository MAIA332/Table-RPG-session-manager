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
import { campaignItemCatalog, enforceInventoryDatabase } from "./inventory-server"
import { applyInventoryRules } from "./character"
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
  personalNotes: Map<string, PersonalNotesRecord>
  activeSounds: Map<string, CampaignSound[]>
  subscribers: Map<string, Set<Subscriber>>
  presence: Map<string, Map<string, number>>
  presenceConnections: Map<string, PresenceConnection>
  releasedPresenceConnections: Map<string, number>
  presenceSubscribers: Set<PresenceSubscriber>
}

const PERSISTED_COLLECTIONS = [
  "users",
  "sessions",
  "campaigns",
  "characters",
  "characterTombstones",
  "maps",
  "lore",
  "combatSessions",
  "campaignState",
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
    users: new Map(),
    sessions: new Map(),
    campaigns: new Map(),
    characters: new Map(),
    characterTombstones: new Map(),
    maps: new Map(),
    lore: new Map(),
    combatSessions: new Map(),
    campaignState: new Map(),
    personalNotes: new Map(),
  }
}

function snapshotFromStore(storeData: StoreShape): PersistedSnapshot {
  const lore = cloneMap(storeData.lore)
  for (const [campaignId, campaignState] of storeData.campaignState) {
    if (Array.isArray(campaignState.lore))
      lore.set(campaignId, cloneValue(campaignState.lore))
  }

  return {
    users: cloneMap(storeData.users),
    sessions: cloneMap(storeData.sessions),
    campaigns: cloneMap(storeData.campaigns),
    characters: cloneMap(storeData.characters),
    characterTombstones: cloneMap(storeData.characterTombstones),
    maps: cloneMap(storeData.maps),
    lore,
    combatSessions: cloneMap(storeData.combatSessions),
    campaignState: cloneMap(storeData.campaignState),
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
  next.campaignState = cloneMap(
    snapshot.campaignState as Map<string, Record<string, unknown>>,
  )
  next.personalNotes = cloneMap(
    snapshot.personalNotes as Map<string, PersonalNotesRecord>,
  )
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

  for (const doc of docs) {
    if (!PERSISTED_COLLECTIONS.includes(doc.collection)) continue
    if (typeof doc.key !== "string") continue
    const target = loaded[doc.collection] as Map<string, unknown>
    target.set(doc.key, cloneValue(doc.value))
  }

  return loaded
}

async function persistSnapshot(
  snapshot: PersistedSnapshot,
  previous: PersistedSnapshot,
): Promise<boolean> {
  const collection = await ensureMongoCollection()
  const operations: AnyBulkWriteOperation<MongoStoreDocument>[] = []
  let changed = false

  for (const collectionName of PERSISTED_COLLECTIONS) {
    const current = snapshot[collectionName]
    const previousMap = previous[collectionName]

    for (const [key, value] of current) {
      if (previousMap.has(key) && equivalent(previousMap.get(key), value)) continue
      changed = true
      operations.push({
        updateOne: {
          filter: { _id: mongoDocumentId(collectionName, key) },
          update: {
            $set: {
              collection: collectionName,
              key,
              value: cloneValue(value),
            },
          },
          upsert: true,
        },
      })
    }

    for (const key of previousMap.keys()) {
      if (current.has(key)) continue
      changed = true
      operations.push({
        deleteOne: {
          filter: { _id: mongoDocumentId(collectionName, key) },
        },
      })
    }
  }

  if (!operations.length) return false
  await collection.bulkWrite(operations, { ordered: false })
  return changed
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

if (!globalForStore.__vttPersistedSnapshot)
  globalForStore.__vttPersistedSnapshot = snapshotFromStore(store)

if (!store.combatSessions) store.combatSessions = new Map()
if (!store.maps) store.maps = new Map()
if (!store.lore) store.lore = new Map()
if (!store.campaignState) store.campaignState = new Map()
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
  const previous = globalForStore.__vttPersistedSnapshot ?? createEmptySnapshot()
  const previousStore = storeFromSnapshot(previous)

  try {
    enforceInventoryDatabase(storeData, previousStore)
  } catch (error) {
    // Preserve the previous safety behavior: only inventory-backed state is
    // rolled back when its validation fails. Other pending changes remain.
    storeData.characters = previousStore.characters
    storeData.campaignState = previousStore.campaignState
    storeData.lore = previousStore.lore
    throw error
  }

  const snapshot = snapshotFromStore(storeData)

  await enqueuePersistence(async () => {
    const changed = await persistSnapshot(snapshot, globalForStore.__vttPersistedSnapshot ?? createEmptySnapshot())
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
      applyInventoryRules(character, campaignItemCatalog(store, campaignId)),
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
