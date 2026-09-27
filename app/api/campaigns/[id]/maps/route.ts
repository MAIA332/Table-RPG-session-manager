import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, saveToDisk, store } from "@/lib/store"
import type { GameMap } from "@/lib/map-types"

export const dynamic = "force-dynamic"
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
// Only invalidation metadata is broadcast. Each viewer fetches their authorized maps.
function notify(campaignId: string, mapId?: string, open = false) {
  publish(campaignId, { type: "map:changed", ...(open ? { openMapId: mapId } : {}) } as any)
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  const maps = Array.from(store.maps.values()).filter((map: GameMap) =>
    map.campaignId === access.campaignId && (access.role === "gm" || map.isPublic === true))
  return NextResponse.json({ maps }, { headers: { "Cache-Control": "no-store" } })
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  const { campaignId, role } = access
  const body = await request.json().catch(() => null)
  const action = String(body?.action ?? "")
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })
  if (action === "create") {
    if (role !== "gm") return fail("Apenas o mestre pode importar mapas.", 403)
    const input = body?.map
    if (!input || typeof input.id !== "string" || !input.id.trim() ||
      typeof input.name !== "string" || typeof input.imageUrl !== "string" || !input.grid ||
      ![input.grid.rows, input.grid.cols, input.grid.tileSize].every((n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n > 0))
      return fail("Mapa inválido.")
    if (store.maps.has(input.id)) return fail("Já existe um mapa com esse identificador.", 409)
    const newMap: GameMap = { ...input, campaignId, isPublic: false, tokens: input.tokens || {}, tiles: input.tiles || {} }
    store.maps.set(newMap.id, newMap)
    saveToDisk(store)
    notify(campaignId)
    return NextResponse.json({ success: true, map: newMap })
  }
  const map = store.maps.get(String(body?.mapId ?? "")) as GameMap | undefined
  if (!map || map.campaignId !== campaignId || (role !== "gm" && map.isPublic !== true))
    return fail("Mapa não encontrado.", 404)
  if (action === "update_tokens") {
    const tokenId = String(body?.tokenId ?? "")
    const x = Number(body?.x), y = Number(body?.y)
    const tokenType = body?.tokenType
    if (!tokenId || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 ||
      x >= map.grid.cols || y >= map.grid.rows || !["character", "creature"].includes(tokenType))
      return fail("Movimento de token inválido.")
    map.tokens ??= {}
    map.tokens[tokenId] = { x, y, type: tokenType }
    saveToDisk(store)
    notify(campaignId)
    return NextResponse.json({ success: true })
  }
  if (role !== "gm") return fail("Apenas o mestre pode alterar o mapa.", 403)
  if (action === "visibility" || action === "show") {
    if (action === "visibility" && typeof body.isPublic !== "boolean") return fail("Visibilidade inválida.")
    map.isPublic = action === "show" || body.isPublic
    saveToDisk(store)
    notify(campaignId, map.id, action === "show")
    return NextResponse.json({ success: true, map })
  }
  if (action === "rename") {
    map.name = String(body.name ?? "").trim() || map.name
  } else if (action === "delete") {
    store.maps.delete(map.id)
  } else if (action === "update_terrain") {
    const tile = body?.tileData
    if (!tile || !Number.isSafeInteger(tile.x) || !Number.isSafeInteger(tile.y) || tile.x < 0 || tile.y < 0 ||
      tile.x >= map.grid.cols || tile.y >= map.grid.rows ||
      !["grass", "water", "lava", "stone", "mud", "wood", "snow"].includes(tile.terrain) ||
      !Number.isFinite(tile.movementCost) || tile.movementCost < 0 || typeof tile.walkable !== "boolean") return fail("Terreno inválido.")
    map.tiles ??= {}
    map.tiles[`${tile.x},${tile.y}`] = tile
  } else return fail("Ação inválida.")
  saveToDisk(store)
  notify(campaignId)
  return NextResponse.json({ success: true })
}
