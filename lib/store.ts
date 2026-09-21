import type { CombatSession } from "./combat-types"
import fs from "fs"
import path from "path"
import type {
  Campaign,
  Character,
  RealtimeEvent,
  SessionToken,
  User,
  PersonalNote,
} from "./types"
import type { GameMap } from "@/lib/map-types"
import {
  campaignItemCatalog,
  enforceInventoryDatabase,
} from "./inventory-server"
import { applyInventoryRules } from "./character"

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

interface PersistedStore {
  users: [string, User][]
  sessions: [string, SessionToken][]
  campaigns: [string, Campaign][]
  characters: [string, Character][]
  characterTombstones: [string, number][]
  maps: [string, GameMap][]
  lore: [string, any[]][]
  combatSessions: [string, CombatSession][]
  campaignState: [string, Record<string, unknown>][]
  personalNotes: [string, PersonalNotesRecord][]
}

const DB_FILE_PATH = process.env.VTT_DB_FILE
  ? path.resolve(process.env.VTT_DB_FILE)
  : path.join(process.cwd(), "vtt-database.json")
const DB_BACKUP_PATH = `${DB_FILE_PATH}.bak`
const DB_LOCK_PATH = `${DB_FILE_PATH}.lock`
const lockWaitBuffer = new Int32Array(new SharedArrayBuffer(4))

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

function parseEntries<T>(value: unknown, field: string): Map<string, T> {
  if (value === undefined) return new Map()
  if (!Array.isArray(value))
    throw new Error(`Campo ${field} inválido no banco de dados.`)

  const entries = value.map((entry) => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== "string"
    ) {
      throw new Error(`Entrada inválida em ${field}.`)
    }
    return [entry[0], entry[1] as T] as [string, T]
  })

  return new Map(entries)
}

function readStoreFile(filePath: string): StoreShape {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
    string,
    unknown
  >
  if (!parsed || typeof parsed !== "object")
    throw new Error("Formato inválido do banco de dados.")

  return {
    ...createEmptyStore(),
    users: parseEntries<User>(parsed.users, "users"),
    sessions: parseEntries<SessionToken>(parsed.sessions, "sessions"),
    campaigns: parseEntries<Campaign>(parsed.campaigns, "campaigns"),
    characters: parseEntries<Character>(parsed.characters, "characters"),
    characterTombstones: parseEntries<number>(
      parsed.characterTombstones,
      "characterTombstones",
    ),
    maps: parseEntries<GameMap>(parsed.maps, "maps"),
    lore: parseEntries<any[]>(parsed.lore, "lore"),
    combatSessions: parseEntries<CombatSession>(
      parsed.combatSessions,
      "combatSessions",
    ),
    campaignState: parseEntries<Record<string, unknown>>(
      parsed.campaignState,
      "campaignState",
    ),
    personalNotes: parseEntries<PersonalNotesRecord>(
      parsed.personalNotes,
      "personalNotes",
    ),
  }
}

function characterTimestamp(character: Character): number {
  return Math.max(
    Number(character.updatedAt) || 0,
    Number(character.createdAt) || 0,
  )
}

function reconcileCharacters(target: StoreShape, source: StoreShape): void {
  for (const [id, deletedAt] of source.characterTombstones) {
    const currentDeletedAt = target.characterTombstones.get(id) ?? 0
    if (deletedAt > currentDeletedAt)
      target.characterTombstones.set(id, deletedAt)
  }

  for (const [id, persistedCharacter] of source.characters) {
    const currentCharacter = target.characters.get(id)
    if (
      !currentCharacter ||
      characterTimestamp(persistedCharacter) >
        characterTimestamp(currentCharacter)
    ) {
      target.characters.set(id, persistedCharacter)
    }
  }

  for (const [id, deletedAt] of target.characterTombstones) {
    const character = target.characters.get(id)
    if (character && deletedAt >= characterTimestamp(character))
      target.characters.delete(id)
  }
}

function reconcileCampaignState(target: StoreShape, source: StoreShape): void {
  for (const [id, session] of source.combatSessions) {
    const current = target.combatSessions.get(id)
    if (!current || session.revision > current.revision)
      target.combatSessions.set(id, session)
  }
  for (const [campaignId, persistedState] of source.campaignState) {
    const currentState = target.campaignState.get(campaignId)
    const persistedAt = Number(persistedState.updatedAt) || 0
    const currentAt = Number(currentState?.updatedAt) || 0
    if (!currentState || persistedAt > currentAt)
      target.campaignState.set(campaignId, persistedState)
  }
}

function reconcilePersonalNotes(target: StoreShape, source: StoreShape): void {
  for (const [key, persistedRecord] of source.personalNotes) {
    const currentRecord = target.personalNotes.get(key)
    if (
      !currentRecord ||
      Number(persistedRecord.updatedAt) > Number(currentRecord.updatedAt)
    ) {
      target.personalNotes.set(key, persistedRecord)
    }
  }
}

function serializeStore(storeData: StoreShape): PersistedStore {
  const lore = new Map(storeData.lore)
  for (const [campaignId, campaignState] of storeData.campaignState) {
    if (Array.isArray(campaignState.lore))
      lore.set(campaignId, campaignState.lore)
  }

  return {
    users: Array.from(storeData.users.entries()),
    sessions: Array.from(storeData.sessions.entries()),
    campaigns: Array.from(storeData.campaigns.entries()),
    characters: Array.from(storeData.characters.entries()),
    characterTombstones: Array.from(storeData.characterTombstones.entries()),
    maps: Array.from(storeData.maps.entries()),
    lore: Array.from(lore.entries()),
    combatSessions: Array.from(storeData.combatSessions.entries()),
    campaignState: Array.from(storeData.campaignState.entries()),
    personalNotes: Array.from(storeData.personalNotes.entries()),
  }
}

function acquireDatabaseLock(): number {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const handle = fs.openSync(DB_LOCK_PATH, "wx")
      fs.writeFileSync(handle, `${process.pid}\n${Date.now()}`, "utf-8")
      return handle
    } catch (error: any) {
      if (error?.code !== "EEXIST") throw error
      try {
        const age = Date.now() - fs.statSync(DB_LOCK_PATH).mtimeMs
        if (age > 30_000) {
          fs.unlinkSync(DB_LOCK_PATH)
          continue
        }
      } catch {}
      Atomics.wait(lockWaitBuffer, 0, 0, 25)
    }
  }
  throw new Error("O banco de dados está ocupado por outro processo.")
}

function releaseDatabaseLock(handle: number): void {
  try {
    fs.closeSync(handle)
  } catch {}
  try {
    fs.unlinkSync(DB_LOCK_PATH)
  } catch {}
}

function replaceFile(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(targetPath)) {
    fs.renameSync(sourcePath, targetPath)
    return
  }

  const displacedPath = `${targetPath}.replace-${process.pid}-${Date.now()}`
  fs.renameSync(targetPath, displacedPath)
  try {
    fs.renameSync(sourcePath, targetPath)
    fs.unlinkSync(displacedPath)
  } catch (error) {
    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath)
    fs.renameSync(displacedPath, targetPath)
    throw error
  }
}

function writeStoreFile(
  storeData: StoreShape,
  preservePrimaryAsBackup: boolean,
): void {
  const previous = fs.existsSync(DB_FILE_PATH)
    ? readStoreFile(DB_FILE_PATH)
    : undefined
  try {
    enforceInventoryDatabase(storeData, previous)
  } catch (error) {
    if (previous) {
      storeData.characters = previous.characters
      storeData.campaignState = previous.campaignState
    }
    throw error
  }
  const serialized = JSON.stringify(serializeStore(storeData), null, 2)
  const tempPath = `${DB_FILE_PATH}.tmp-${process.pid}-${Date.now()}`
  const tempHandle = fs.openSync(tempPath, "wx")

  try {
    fs.writeFileSync(tempHandle, serialized, "utf-8")
    fs.fsyncSync(tempHandle)
  } finally {
    fs.closeSync(tempHandle)
  }

  try {
    if (preservePrimaryAsBackup && fs.existsSync(DB_FILE_PATH)) {
      const backupTempPath = `${DB_BACKUP_PATH}.tmp-${process.pid}-${Date.now()}`
      fs.copyFileSync(DB_FILE_PATH, backupTempPath)
      replaceFile(backupTempPath, DB_BACKUP_PATH)
    }
    replaceFile(tempPath, DB_FILE_PATH)
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
}

export function saveToDisk(storeData: StoreShape): void {
  const lockHandle = acquireDatabaseLock()
  try {
    let primaryStore: StoreShape | null = null
    let backupStore: StoreShape | null = null
    let primaryReadError: unknown = null

    if (fs.existsSync(DB_FILE_PATH)) {
      try {
        primaryStore = readStoreFile(DB_FILE_PATH)
      } catch (error) {
        primaryReadError = error
      }
    }
    if (fs.existsSync(DB_BACKUP_PATH)) {
      try {
        backupStore = readStoreFile(DB_BACKUP_PATH)
      } catch {}
    }

    if (primaryReadError && !backupStore) {
      throw new Error(
        "O banco principal está inválido e não há backup válido. A gravação foi cancelada para proteger os dados.",
        { cause: primaryReadError },
      )
    }

    if (primaryStore) {
      reconcileCharacters(storeData, primaryStore)
      reconcileCampaignState(storeData, primaryStore)
      reconcilePersonalNotes(storeData, primaryStore)
    }
    if (backupStore) {
      reconcileCharacters(storeData, backupStore)
      reconcileCampaignState(storeData, backupStore)
      reconcilePersonalNotes(storeData, backupStore)
    }

    if (primaryReadError && fs.existsSync(DB_FILE_PATH)) {
      fs.renameSync(DB_FILE_PATH, `${DB_FILE_PATH}.corrupt-${Date.now()}`)
    }

    writeStoreFile(storeData, Boolean(primaryStore))
  } finally {
    releaseDatabaseLock(lockHandle)
  }
}

export function loadFromDisk(): StoreShape {
  const primaryExists = fs.existsSync(DB_FILE_PATH)
  const backupExists = fs.existsSync(DB_BACKUP_PATH)
  let primaryStore: StoreShape | null = null
  let backupStore: StoreShape | null = null
  let primaryReadError: unknown = null
  let backupReadError: unknown = null

  if (primaryExists) {
    try {
      primaryStore = readStoreFile(DB_FILE_PATH)
    } catch (error) {
      primaryReadError = error
    }
  }
  if (backupExists) {
    try {
      backupStore = readStoreFile(DB_BACKUP_PATH)
    } catch (error) {
      backupReadError = error
    }
  }

  if (!primaryStore && !backupStore) {
    if (!primaryExists && !backupExists) return createEmptyStore()
    throw new Error(
      "Não foi possível carregar o banco principal nem o backup.",
      { cause: primaryReadError ?? backupReadError },
    )
  }

  const loadedStore = primaryStore ?? backupStore!
  if (primaryStore && backupStore) {
    reconcileCharacters(loadedStore, backupStore)
    reconcileCampaignState(loadedStore, backupStore)
    reconcilePersonalNotes(loadedStore, backupStore)
  }

  return loadedStore
}

const globalForStore = globalThis as unknown as { __vttStore?: StoreShape }

export const store: StoreShape = globalForStore.__vttStore ?? loadFromDisk()

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
  userId: string
): CampaignSound[] {
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return []

  const role = getMemberRole(campaign, userId)
  if (!role) return []

  const sounds = store.activeSounds.get(campaignId) || []

  return sounds.filter(sound =>
    role === "gm" ||
    sound.targetUserId == null ||
    sound.targetUserId === userId
  )
}

export function notifySoundsChanged(campaignId: string): void {
  // Não transmite URL, destinatário nem identificador do som ao canal coletivo.
  // Cada cliente atualiza sua lista pela rota autenticada de sons.
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

/** Read, resolve and persist under the same disk lock. Callback MUST be synchronous.
 * Nothing is published or applied to the live store before the disk write succeeds.
 */
export function transactStore<T>(
  callback: (draft: StoreShape) => { value: T; changed: boolean },
): T {
  fs.mkdirSync(path.dirname(DB_FILE_PATH), { recursive: true })
  const lock = acquireDatabaseLock()
  try {
    const draft = loadFromDisk()
    const result = callback(draft)
    if (result && typeof (result as any).then === "function")
      throw new Error("Transação assíncrona não permitida")
    if (result.changed) {
      let primaryValid = false
      if (fs.existsSync(DB_FILE_PATH)) {
        try {
          readStoreFile(DB_FILE_PATH)
          primaryValid = true
        } catch {
          fs.renameSync(DB_FILE_PATH, `${DB_FILE_PATH}.corrupt-${Date.now()}`)
        }
      }
      writeStoreFile(draft, primaryValid)
    }
    // Keep live subscriptions and presence. Replace only persisted collections.
    store.users = draft.users
    store.sessions = draft.sessions
    store.campaigns = draft.campaigns
    store.characters = draft.characters
    store.characterTombstones = draft.characterTombstones
    store.maps = draft.maps
    store.lore = draft.lore
    store.campaignState = draft.campaignState
    store.personalNotes = draft.personalNotes
    store.combatSessions = draft.combatSessions
    return result.value
  } finally {
    releaseDatabaseLock(lock)
  }
}
