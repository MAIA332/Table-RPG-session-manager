import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import {
  getMemberRole, getVisibleSounds, notifySoundsChanged, store,
  type CampaignSound,
} from "@/lib/store"

export const dynamic = "force-dynamic"

/** A fila completa fica somente no armazenamento do servidor. */
type QueueItem = { itemId: string; trackId: string; url: string; loops: number }
type RuntimePlaylist = {
  sessionId: string
  playlistId: string
  playlistName: string
  index: number
  iteration: number
  items: QueueItem[]
}
type PlayingSound = CampaignSound & { playlist?: RuntimePlaylist; paused?: boolean }

type Access = {
  campaignId: string
  campaign: NonNullable<ReturnType<typeof store.campaigns.get>>
  role: NonNullable<ReturnType<typeof getMemberRole>>
  userId: string
}

async function getAccess(params: Promise<{ id: string }>): Promise<Access | { error: NextResponse }> {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }
  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }
  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }
  return { campaignId, campaign, role, userId: user.id }
}

function getActive(campaignId: string): PlayingSound[] {
  return (store.activeSounds.get(campaignId) || []) as PlayingSound[]
}

function saveActive(campaignId: string, sounds: PlayingSound[]) {
  store.activeSounds.set(campaignId, sounds)
  notifySoundsChanged(campaignId)
}

function soundResponse(campaignId: string, userId: string) {
  const sounds = (getVisibleSounds(campaignId, userId) as PlayingSound[]).map(sound => {
    if (!sound.playlist) return sound
    const { items, ...publicPlaylist } = sound.playlist
    return { ...sound, playlist: { ...publicPlaylist, total: items.length } }
  })
  return NextResponse.json({
    success: true,
    capabilities: { targetedSound: true, playlists: true },
    sounds,
  }, { headers: { "Cache-Control": "private, no-store" } })
}

function validUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || !value.trim()) return false
  if (value.startsWith("/") && !value.startsWith("//")) return true
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch { return false }
}

function parseTarget(value: unknown, access: Access): string | null | undefined {
  if (value === undefined || value === null || value === "") return null
  if (typeof value !== "string" || !value.trim() || getMemberRole(access.campaign, value) !== "player") return undefined
  return value
}

function parseQueue(value: unknown): QueueItem[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 100) return null
  const items: QueueItem[] = []
  const ids = new Set<string>()
  let totalExecutions = 0
  for (const raw of value) {
    if (!raw || typeof raw.itemId !== "string" || !raw.itemId || ids.has(raw.itemId) ||
        typeof raw.trackId !== "string" || !raw.trackId || !validUrl(raw.url) ||
        !Number.isInteger(raw.loops) || raw.loops < 0 || raw.loops > 99) return null
    ids.add(raw.itemId)
    totalExecutions += raw.loops + 1
    if (totalExecutions > 500) return null
    items.push({ itemId: raw.itemId, trackId: raw.trackId, url: raw.url, loops: raw.loops })
  }
  return items
}

function makeQueuedSound(playlist: RuntimePlaylist, targetUserId: string | null): PlayingSound {
  const item = playlist.items[playlist.index]
  return {
    id: `playlist-${randomUUID()}`,
    trackId: item.trackId,
    url: item.url,
    loop: false, // O número de repetições é controlado pelo servidor, não por HTMLAudio.loop.
    targetUserId,
    playlist,
  }
}

function advance(campaignId: string, id: string, direction: "ended" | "next" | "previous") {
  const current = getActive(campaignId)
  const position = current.findIndex(sound => sound.id === id && sound.playlist)
  if (position < 0) return false
  const existing = current[position]
  const previous = existing.playlist!
  let index = previous.index
  let iteration = previous.iteration
  if (direction === "previous") {
    index = Math.max(0, index - 1)
    iteration = 0
  } else if (direction === "next") {
    index += 1
    iteration = 0
  } else if (iteration < previous.items[index].loops) {
    iteration += 1
  } else {
    index += 1
    iteration = 0
  }
  const next = current.slice()
  if (index >= previous.items.length) {
    next.splice(position, 1)
  } else {
    const playlist = { ...previous, index, iteration }
    next[position] = makeQueuedSound(playlist, existing.targetUserId ?? null)
  }
  saveActive(campaignId, next)
  return true
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if ("error" in access) return access.error
  return soundResponse(access.campaignId, access.userId)
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if ("error" in access) return access.error
  const { campaignId, role, userId } = access
  const body = await request.json().catch(() => null)

  if (body?.action === "ended") {
    if (typeof body.id !== "string" || !body.id.trim())
      return NextResponse.json({ error: "Som inválido." }, { status: 400 })
    const sound = getActive(campaignId).find(item => item.id === body.id)
    if (!sound) return soundResponse(campaignId, userId) // Idempotente: encerramento atrasado.
    if (sound.playlist) {
      // Apenas a reprodução do GM avança a fila. Os jogadores nunca duplicam o avanço.
      if (role !== "gm") return NextResponse.json({ error: "Apenas o mestre avança playlists." }, { status: 403 })
      advance(campaignId, body.id, "ended")
      return soundResponse(campaignId, userId)
    }
    if (sound.loop || (role !== "gm" && sound.targetUserId !== userId))
      return NextResponse.json({ error: "Sem permissão para finalizar este som." }, { status: 403 })
    saveActive(campaignId, getActive(campaignId).filter(item => item.id !== body.id))
    return soundResponse(campaignId, userId)
  }

  if (role !== "gm")
    return NextResponse.json({ error: "Apenas o mestre pode controlar os sons." }, { status: 403 })

  if (body?.action === "playlist_start") {
    const items = parseQueue(body.items)
    const target = parseTarget(body.targetUserId, access)
    if (!items || target === undefined || typeof body.playlistId !== "string" || !body.playlistId.trim() ||
        typeof body.playlistName !== "string" || !body.playlistName.trim() || body.playlistName.length > 150)
      return NextResponse.json({ error: "Playlist ou destinatário inválido." }, { status: 400 })
    const playlist: RuntimePlaylist = {
      sessionId: randomUUID(), playlistId: body.playlistId,
      playlistName: body.playlistName.trim(), index: 0, iteration: 0, items,
    }
    // Uma playlist substitui somente a playlist anterior do MESMO destinatário.
    const otherSounds = getActive(campaignId).filter(sound => !(sound.playlist && (sound.targetUserId ?? null) === target))
    saveActive(campaignId, [...otherSounds, makeQueuedSound(playlist, target)])
    return soundResponse(campaignId, userId)
  }

  if (body?.action === "playlist_next" || body?.action === "playlist_previous") {
    if (typeof body.id !== "string" || !body.id.trim())
      return NextResponse.json({ error: "Faixa inválida." }, { status: 400 })
    advance(campaignId, body.id, body.action === "playlist_next" ? "next" : "previous")
    return soundResponse(campaignId, userId)
  }

  if (body?.action === "play") {
    if (typeof body.id !== "string" || !body.id.trim() ||
        typeof body.trackId !== "string" || !body.trackId.trim() || !validUrl(body.url) ||
        (body.loop !== undefined && typeof body.loop !== "boolean"))
      return NextResponse.json({ error: "Som inválido." }, { status: 400 })
    const target = parseTarget(body.targetUserId, access)
    if (target === undefined)
      return NextResponse.json({ error: "Selecione um jogador válido desta campanha." }, { status: 400 })
    const sound: PlayingSound = {
      id: body.id, trackId: body.trackId, url: body.url,
      loop: body.loop ?? false, targetUserId: target,
    }
    const current = getActive(campaignId)
    if (current.some(item => item.id === sound.id))
      return NextResponse.json({ error: "Este identificador de reprodução já está em uso." }, { status: 409 })
    // Música contínua individual substitui a playlist correspondente; efeitos avulsos coexistem.
    const base = sound.loop ? current.filter(item => !(item.playlist && (item.targetUserId ?? null) === target)) : current
    saveActive(campaignId, [...base, sound])
    return soundResponse(campaignId, userId)
  }

  if (body?.action === "pause" || body?.action === "resume") {
    if (typeof body.id !== "string" || !body.id.trim())
      return NextResponse.json({ error: "Som inválido." }, { status: 400 })
    const paused = body.action === "pause"
    const current = getActive(campaignId)
    if (current.some(sound => sound.id === body.id)) {
      saveActive(campaignId, current.map(sound => sound.id === body.id ? { ...sound, paused } : sound))
    }
    return soundResponse(campaignId, userId)
  }

  if (body?.action === "stop") {
    if (typeof body.id !== "string" || !body.id.trim())
      return NextResponse.json({ error: "Som inválido." }, { status: 400 })
    saveActive(campaignId, getActive(campaignId).filter(sound => sound.id !== body.id))
    return soundResponse(campaignId, userId)
  }

  if (body?.action === "stop_all") {
    saveActive(campaignId, [])
    return soundResponse(campaignId, userId)
  }

  return NextResponse.json({ error: "Ação de som inválida." }, { status: 400 })
}
