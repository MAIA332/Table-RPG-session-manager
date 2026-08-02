import fs from "fs"
import path from "path"
import type {
  Campaign,
  Character,
  RealtimeEvent,
  SessionToken,
  User,
} from "./types"
import type { GameMap } from "@/lib/map-types"

// Assinante do barramento de eventos realtime
type Subscriber = (event: RealtimeEvent) => void

interface StoreShape {
  users: Map<string, User>
  sessions: Map<string, SessionToken>
  campaigns: Map<string, Campaign>
  characters: Map<string, Character>
  maps: Map<string, GameMap> // ESSENCIAL PARA O SISTEMA DE VTT FUNCIONAR
  subscribers: Map<string, Set<Subscriber>>
}

const DB_FILE_PATH = path.join(process.cwd(), "vtt-database.json")

// ==========================================
// LÓGICA DE AUTO-SAVE E CARREGAMENTO (I/O)
// ==========================================
function saveToDisk(storeData: StoreShape) {
  try {
    const serializedData = {
      users: Array.from(storeData.users.entries()),
      sessions: Array.from(storeData.sessions.entries()),
      campaigns: Array.from(storeData.campaigns.entries()),
      characters: Array.from(storeData.characters.entries()),
      maps: storeData.maps ? Array.from(storeData.maps.entries()) : [], // Evita crash no Auto-save
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(serializedData, null, 2), "utf-8")
    console.log(`[Auto-Save] Bando de Dados salvo em disco: ${new Date().toLocaleTimeString()}`)
  } catch (error) {
    console.error("[Auto-Save] Erro ao salvar dados:", error)
  }
}

function loadFromDisk(): StoreShape {
  const defaultStore: StoreShape = {
    users: new Map(),
    sessions: new Map(),
    campaigns: new Map(),
    characters: new Map(),
    maps: new Map(), // ESSENCIAL PARA O MAPA INICIALIZAR
    subscribers: new Map(),
  }

  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const fileData = fs.readFileSync(DB_FILE_PATH, "utf-8")
      const parsedData = JSON.parse(fileData)

      if (parsedData.users) defaultStore.users = new Map(parsedData.users)
      if (parsedData.sessions) defaultStore.sessions = new Map(parsedData.sessions)
      if (parsedData.campaigns) defaultStore.campaigns = new Map(parsedData.campaigns)
      if (parsedData.characters) defaultStore.characters = new Map(parsedData.characters)
      if (parsedData.maps) defaultStore.maps = new Map(parsedData.maps) // CARREGA OS MAPAS DO JSON
    }
  } catch (error) {
    console.error("[DB] Arquivo corrompido ou erro ao ler. Iniciando zerado.", error)
  }

  return defaultStore
}

// ==========================================
// INICIALIZAÇÃO DA STORE & LOOP DE SAVE
// ==========================================
const globalForStore = globalThis as unknown as { 
  __vttStore?: StoreShape;
  __vttAutoSaveInterval?: NodeJS.Timeout;
}

export const store: StoreShape = globalForStore.__vttStore ?? loadFromDisk()

// Fallback crítico caso o cache do Next.js mantenha uma versão velha na memória sem 'maps'
if (!store.maps) {
  store.maps = new Map();
}

globalForStore.__vttStore = store

if (!globalForStore.__vttAutoSaveInterval) {
  const SAVE_INTERVAL_MS = 60 * 1000; 
  globalForStore.__vttAutoSaveInterval = setInterval(() => {
    saveToDisk(store)
  }, SAVE_INTERVAL_MS)
}

// ==========================================
// FUNÇÕES AUXILIARES DA STORE
// ==========================================
export function genId(prefix = "id"): string { return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}` }

export function subscribe(campaignId: string, fn: Subscriber): () => void {
  let set = store.subscribers.get(campaignId)
  if (!set) {
    set = new Set()
    store.subscribers.set(campaignId, set)
  }
  set.add(fn)
  return () => { set?.delete(fn) }
}

export function publish(campaignId: string, event: RealtimeEvent): void {
  const set = store.subscribers.get(campaignId)
  if (!set) return
  for (const fn of set) {
    try { fn(event) } catch {}
  }
}

export function getCampaignCharacters(campaignId: string): Character[] {
  return [...store.characters.values()].filter((c) => c.campaignId === campaignId).sort((a, b) => a.createdAt - b.createdAt)
}
export function getUserCampaigns(userId: string): Campaign[] {
  return [...store.campaigns.values()].filter((c) => c.members.some((m) => m.userId === userId)).sort((a, b) => b.createdAt - a.createdAt)
}
export function findCampaignByCode(code: string): Campaign | undefined {
  const upper = code.trim().toUpperCase()
  return [...store.campaigns.values()].find((c) => c.code === upper)
}
export function getMemberRole(campaign: Campaign, userId: string) {
  return campaign.members.find((m) => m.userId === userId)?.role
}