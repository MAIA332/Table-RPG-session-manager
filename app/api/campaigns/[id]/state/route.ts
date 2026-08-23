import fs from "fs/promises"
import path from "path"
import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { CAMPAIGN_STATE_ARRAY_FIELDS, getCampaignState, getCampaignStateFields, updateCampaignState } from "@/lib/campaign-state"
import { getMemberRole, store } from "@/lib/store"

async function getAccess(params: Promise<{ id: string }>) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }

  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }

  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 }) }
  return { campaignId, role, user }
}

async function migrateLegacyState(campaignId: string) {
  const raw = store.campaignState.get(campaignId) || {}
  const patch: Record<string, unknown> = {}

  if (!Object.prototype.hasOwnProperty.call(raw, "lore") && store.lore.has(campaignId)) {
    patch.lore = store.lore.get(campaignId) || []
  }

  if (!Object.prototype.hasOwnProperty.call(raw, "gallery")) {
    try {
      const filePath = path.join(process.cwd(), "data", `gallery_${campaignId}.json`)
      const gallery = JSON.parse(await fs.readFile(filePath, "utf-8"))
      if (Array.isArray(gallery)) patch.gallery = gallery
    } catch {}
  }

  if (Object.keys(patch).length > 0) updateCampaignState(campaignId, patch)
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error

  await migrateLegacyState(access.campaignId)
  const state = getCampaignState(access.campaignId)
  const persistedFields = getCampaignStateFields(access.campaignId)

  if (access.role !== "gm") {
    return NextResponse.json({
      state: {
        gallery: state.gallery.filter((entry: any) => entry?.isPublic),
        lore: state.lore.filter((entry: any) => entry?.isPublic || entry?.allowedMembers?.includes(access.user.id)),
        weather: state.weather,
      },
      persistedFields,
    })
  }

  return NextResponse.json({ state, persistedFields })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getAccess(params)
  if (access.error) return access.error
  if (access.role !== "gm") return NextResponse.json({ error: "Apenas o mestre pode salvar o estado da campanha." }, { status: 403 })

  const body = await request.json().catch(() => null)
  const source = body?.state
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  for (const field of CAMPAIGN_STATE_ARRAY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      if (!Array.isArray(source[field])) return NextResponse.json({ error: `Campo ${field} inválido.` }, { status: 400 })
      patch[field] = source[field]
    }
  }
  if (Object.prototype.hasOwnProperty.call(source, "weather")) {
    if (typeof source.weather !== "string") return NextResponse.json({ error: "Clima inválido." }, { status: 400 })
    patch.weather = source.weather
  }
  if (Object.prototype.hasOwnProperty.call(source, "weather")) {
    if (typeof source.weather !== "string") return NextResponse.json({ error: "Clima inválido." }, { status: 400 })
    patch.weather = source.weather
  }

  if (Object.prototype.hasOwnProperty.call(source, "customCreatures")) {
    if (!Array.isArray(source.customCreatures)) return NextResponse.json({ error: "Criaturas inválidas." }, { status: 400 })
    patch.customCreatures = source.customCreatures
  }

   if (Object.prototype.hasOwnProperty.call(source, "customEquipment")) {
    if (!Array.isArray(source.customCreatures)) return NextResponse.json({ error: "Itens inválidas." }, { status: 400 })
    patch.customCreatures = source.customCreatures
  }
  // ---------------------------

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nenhum campo persistente informado." }, { status: 400 })
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nenhum campo persistente informado." }, { status: 400 })

  const state = updateCampaignState(access.campaignId, patch)
  return NextResponse.json({ success: true, state, persistedFields: getCampaignStateFields(access.campaignId) })
}
