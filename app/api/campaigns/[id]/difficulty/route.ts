import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store } from "@/lib/store"
import { getMongoDb } from "@/lib/mongodb"
import {
  DEFAULT_DIFFICULTY_SETTINGS, readDifficultySettings, validateDifficultySettings,
  type DifficultySettings,
} from "@/lib/dynamic-difficulty"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: Promise<{ id: string }> }
type DifficultyDoc = {
  _id: string
  revision: number
  settings: DifficultySettings
  updatedAt: number
  updatedBy: string
}
const COLLECTION = "vtt_campaign_difficulty_settings"
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store" },
})

async function access(params: RouteContext["params"]) {
  const user = await getCurrentUser()
  if (!user) return { error: json({ error: "Não autenticado." }, 401) }
  const { id: campaignId } = await params
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return { error: json({ error: "Campanha não encontrada." }, 404) }
  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: json({ error: "Sem acesso à campanha." }, 403) }
  return { campaignId, userId: user.id, isGm: role === "gm" }
}

/** Leitura pública apenas para membros autenticados da campanha. */
export async function GET(_request: Request, { params }: RouteContext) {
  const auth = await access(params)
  if ("error" in auth) return auth.error
  try {
    const db = await getMongoDb()
    const doc = await db.collection<DifficultyDoc>(COLLECTION).findOne({ _id: auth.campaignId })
    return json({ success: true, settings: doc ? readDifficultySettings(doc.settings) : DEFAULT_DIFFICULTY_SETTINGS,
      revision: doc?.revision ?? 0 })
  } catch (error) {
    console.error("[DIFFICULTY_GET]", error)
    return json({ error: "Não foi possível ler as configurações do MongoDB." }, 503)
  }
}

/** Somente Mestre pode alterar os parâmetros; gravação atômica com revisão. */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await access(params)
  if ("error" in auth) return auth.error
  if (!auth.isGm) return json({ error: "Somente o Mestre pode alterar a dificuldade." }, 403)
  const raw = await request.text().catch(() => "")
  if (Buffer.byteLength(raw, "utf8") > 4096) return json({ error: "Configuração muito grande." }, 413)
  let payload: unknown
  try { payload = JSON.parse(raw) } catch { return json({ error: "JSON inválido." }, 400) }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return json({ error: "Solicitação inválida." }, 400)
  const body = payload as Record<string, unknown>
  if (!Number.isSafeInteger(body.expectedRevision) || (body.expectedRevision as number) < 0)
    return json({ error: "Revisão inválida." }, 400)
  let settings: DifficultySettings
  try { settings = validateDifficultySettings(body.settings) }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Parâmetros inválidos." }, 400) }
  try {
    const collection = (await getMongoDb()).collection<DifficultyDoc>(COLLECTION)
    const now = Date.now()
    let revision: number
    if (body.expectedRevision === 0) {
      try {
        await collection.insertOne({ _id: auth.campaignId, revision: 1, settings, updatedAt: now, updatedBy: auth.userId })
      } catch (error) {
        if ((error as { code?: number }).code === 11000)
          return json({ error: "As configurações foram alteradas em outra aba. Recarregue antes de salvar.", code: "CONFLICT" }, 409)
        throw error
      }
      revision = 1
    } else {
      const result = await collection.updateOne({ _id: auth.campaignId,
        revision: body.expectedRevision as number }, {
        $set: { settings, updatedAt: now, updatedBy: auth.userId }, $inc: { revision: 1 },
      })
      if (!result.matchedCount)
        return json({ error: "As configurações foram alteradas em outra aba. Recarregue antes de salvar.", code: "CONFLICT" }, 409)
      revision = (body.expectedRevision as number) + 1
    }
    // Apenas sinal: os valores devem ser consultados pela API com autenticação.
    publish(auth.campaignId!, { type: "difficulty:settings:updated" } as any)
    return json({ success: true, settings, revision })
  } catch (error) {
    console.error("[DIFFICULTY_PUT]", error)
    return json({ error: "Falha ao gravar no MongoDB. A alteração não foi confirmada." }, 503)
  }
}
