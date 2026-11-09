import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store } from "@/lib/store"
import { getMongoDb } from "@/lib/mongodb"
import { EQUIPMENT } from "@/lib/game-data"
import { getCampaignState } from "@/lib/campaign-state"
import { mannequinItems, normalizeMannequinPlacements, assertUniqueMannequinSlots, type MannequinPlacement } from "@/lib/equipment-mannequin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
type RouteProps = { params: Promise<{ id: string }> }
type MannequinDocument = {
  _id: string
  campaignId: string
  revision: number
  placements: MannequinPlacement[]
  updatedAt: number
  updatedBy: string
}
const COLLECTION = "vtt_character_mannequins"

async function access(params: RouteProps["params"]) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }
  const { id } = await params
  const character = store.characters.get(id)
  if (!character) return { error: NextResponse.json({ error: "Ficha não encontrada." }, { status: 404 }) }
  const campaign = store.campaigns.get(character.campaignId)
  const role = campaign && getMemberRole(campaign, user.id)
  if (!role || (role !== "gm" && character.ownerId !== user.id))
    return { error: NextResponse.json({ error: "Sem permissão para o Manequim." }, { status: 403 }) }
  return { character, userId: user.id }
}

const response = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
})

export async function GET(_request: Request, { params }: RouteProps) {
  const auth = await access(params)
  if ("error" in auth) return auth.error
  try {
    const db = await getMongoDb()
    const document = await db.collection<MannequinDocument>(COLLECTION).findOne({ _id: auth.character.id })
    return response({ success: true, revision: document?.revision ?? 0,
      placements: document?.placements ?? [] })
  } catch (error) {
    console.error("[MANNEQUIN_GET]", error)
    return response({ error: "Não foi possível carregar o Manequim do MongoDB." }, 503)
  }
}

export async function PUT(request: Request, { params }: RouteProps) {
  const auth = await access(params)
  if ("error" in auth) return auth.error
  const raw = await request.text().catch(() => "")
  if (Buffer.byteLength(raw, "utf8") > 100_000) return response({ error: "Configuração muito grande." }, 413)
  let body: any
  try { body = JSON.parse(raw) } catch { return response({ error: "JSON inválido." }, 400) }
  if (!body || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0)
    return response({ error: "Revisão de configuração inválida." }, 400)
  let placements: MannequinPlacement[]
  try { placements = normalizeMannequinPlacements(body.placements); assertUniqueMannequinSlots(placements) }
  catch (error) { return response({ error: error instanceof Error ? error.message : "Posições inválidas." }, 400) }

  // Não aceitar IDs forjados para a visualização. Usar o inventário AUTORITATIVO,
  // nunca a lista enviada pelo cliente. Itens personalizados são da campanha.
  const state = getCampaignState(auth.character.campaignId) as any
  const catalog = [...(Array.isArray(state.customEquipment) ? state.customEquipment : []),
    ...EQUIPMENT.filter(item => !(state.customEquipment || []).some((own: any) => own?.id === item.id))]
  const allowed = new Set(mannequinItems(auth.character, catalog).map(item => item.key))
  if (placements.some(item => !allowed.has(item.key)))
    return response({ error: "O inventário mudou. Reabra o Manequim para atualizar os itens em uso." }, 409)

  try {
    const db = await getMongoDb()
    const collection = db.collection<MannequinDocument>(COLLECTION)
    const now = Date.now()
    if (body.expectedRevision === 0) {
      try {
        await collection.insertOne({ _id: auth.character.id, campaignId: auth.character.campaignId,
          revision: 1, placements, updatedAt: now, updatedBy: auth.userId })
        return response({ success: true, revision: 1, placements })
      } catch (error) {
        if ((error as { code?: number }).code === 11000)
          return response({ error: "O Manequim foi atualizado em outra aba. Recarregue antes de salvar.", code: "CONFLICT" }, 409)
        throw error
      }
    }
    const saved = await collection.updateOne({ _id: auth.character.id, campaignId: auth.character.campaignId,
      revision: body.expectedRevision }, {
      $set: { placements, updatedAt: now, updatedBy: auth.userId }, $inc: { revision: 1 },
    })
    if (!saved.matchedCount)
      return response({ error: "Outra aba modificou a disposição. Recarregue antes de salvar.", code: "CONFLICT" }, 409)
    return response({ success: true, revision: body.expectedRevision + 1, placements })
  } catch (error) {
    console.error("[MANNEQUIN_PUT]", error)
    return response({ error: "Falha ao confirmar o salvamento no MongoDB. Nada foi gravado localmente." }, 503)
  }
}
