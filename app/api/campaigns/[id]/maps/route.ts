import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, saveToDisk, store } from "@/lib/store"

async function getAccess(params: Promise<{ id: string }>) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }

  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }

  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }

  return { campaignId, role }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error

  const maps = Array.from(store.maps.values()).filter((map) => map.campaignId === access.campaignId)
  return NextResponse.json({ maps })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error

  const { campaignId, role } = access
  const body = await request.json().catch(() => null)
  const action = String(body?.action ?? "")

  if (action === "create") {
    if (role !== "gm") return NextResponse.json({ error: "Apenas o mestre pode importar mapas." }, { status: 403 })
    if (!body?.map?.id) return NextResponse.json({ error: "Mapa inválido." }, { status: 400 })
    const newMap = { ...body.map, campaignId }
    store.maps.set(newMap.id, newMap)
    saveToDisk(store)
    publish(campaignId, { type: "map:created", map: newMap } as any)
    return NextResponse.json({ success: true, map: newMap })
  }

  const map = store.maps.get(String(body?.mapId ?? ""))
  if (!map || map.campaignId !== campaignId) {
    return NextResponse.json({ error: "Mapa não encontrado." }, { status: 404 })
  }

  if (action === "update_tokens") {
    const tokenId = String(body?.tokenId ?? "")
    const x = Number(body?.x)
    const y = Number(body?.y)
    const tokenType = body?.tokenType
    if (!tokenId || !Number.isFinite(x) || !Number.isFinite(y) || !["character", "creature"].includes(tokenType)) {
      return NextResponse.json({ error: "Movimento de token inválido." }, { status: 400 })
    }
    if (!map.tokens) map.tokens = {}
    map.tokens[tokenId] = { x, y, type: tokenType }
    saveToDisk(store)
    publish(campaignId, { type: "map:token_moved", mapId: map.id, tokenId, x, y, tokenType } as any)
    return NextResponse.json({ success: true })
  }

  if (role !== "gm") return NextResponse.json({ error: "Apenas o mestre pode alterar o mapa." }, { status: 403 })

  if (action === "rename") {
    map.name = String(body.name ?? "").trim() || map.name
    saveToDisk(store)
    publish(campaignId, { type: "map:renamed", mapId: map.id, name: map.name } as any)
    return NextResponse.json({ success: true })
  }

  if (action === "delete") {
    store.maps.delete(map.id)
    saveToDisk(store)
    publish(campaignId, { type: "map:deleted", mapId: map.id } as any)
    return NextResponse.json({ success: true })
  }

  if (action === "update_terrain") {
    const tile = body?.tileData
    if (!tile || !Number.isFinite(Number(tile.x)) || !Number.isFinite(Number(tile.y))) {
      return NextResponse.json({ error: "Terreno inválido." }, { status: 400 })
    }
    if (!map.tiles) map.tiles = {}
    map.tiles[`${tile.x},${tile.y}`] = tile
    saveToDisk(store)
    publish(campaignId, { type: "map:terrain_updated", mapId: map.id, tileData: tile } as any)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 })
}
