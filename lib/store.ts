import type {
  Campaign,
  Character,
  RealtimeEvent,
  SessionToken,
  User,
} from "./types"

// Assinante do barramento de eventos realtime (uma conexao SSE por assinante)
type Subscriber = (event: RealtimeEvent) => void

interface StoreShape {
  users: Map<string, User>
  sessions: Map<string, SessionToken>
  campaigns: Map<string, Campaign>
  characters: Map<string, Character>
  // campaignId -> conjunto de assinantes SSE
  subscribers: Map<string, Set<Subscriber>>
}

// Singleton preservado entre recompilacoes de HMR do Next.js
const globalForStore = globalThis as unknown as { __vttStore?: StoreShape }

function createStore(): StoreShape {
  return {
    users: new Map(),
    sessions: new Map(),
    campaigns: new Map(),
    characters: new Map(),
    subscribers: new Map(),
  }
}

export const store: StoreShape = globalForStore.__vttStore ?? createStore()
globalForStore.__vttStore = store

export function genId(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

// ---- Barramento realtime (SSE) ----
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
    } catch {
      // ignora assinantes com erro
    }
  }
}

// ---- Consultas auxiliares ----
export function getCampaignCharacters(campaignId: string): Character[] {
  return [...store.characters.values()]
    .filter((c) => c.campaignId === campaignId)
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
