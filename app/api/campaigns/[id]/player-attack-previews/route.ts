import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store, transactStore } from "@/lib/store"
import type { PlayerAttackPreview } from "@/lib/player-special-attacks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function access(id: string) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) }
  const campaign = store.campaigns.get(id)
  if (!campaign) return { error: NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 }) }
  const role = getMemberRole(campaign, user.id)
  if (!role) return { error: NextResponse.json({ error: "Sem acesso." }, { status: 403 }) }
  return { role, user }
}
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await access(id)
  if (result.error) return result.error
  const saved = store.campaignState.get(id)?.playerAttackPreviews
  const now = Date.now()
  const previews = (Array.isArray(saved) ? saved : [])
    .filter((entry: PlayerAttackPreview) => entry?.expiresAt > now && entry.campaignId === id)
  return NextResponse.json({ previews, serverNow: now }, { headers: { "Cache-Control": "no-store" } })
}
/** Cancelamento global antes de 5 minutos; permitido somente ao Mestre. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const result = await access(id)
    if (result.error) return result.error
    if (result.role !== "gm") return NextResponse.json({ error: "Apenas o Mestre pode cancelar." }, { status: 403 })
    const body = await request.json().catch(() => null)
    const previewId = body?.previewId
    if (typeof previewId !== "string" || !previewId || previewId.length > 100)
      return NextResponse.json({ error: "Imagem inválida." }, { status: 400 })
    const changed = await transactStore(db => {
      const state = db.campaignState.get(id) || {}
      const list = Array.isArray(state.playerAttackPreviews)
        ? state.playerAttackPreviews as PlayerAttackPreview[] : []
      const next = list.filter(entry => entry.id !== previewId && entry.expiresAt > Date.now())
      if (next.length === list.length) return { value: false, changed: false }
      db.campaignState.set(id, { ...state, playerAttackPreviews: next })
      return { value: true, changed: true }
    }) as boolean
    if (changed) publish(id, { type: "player-attack-preview:updated" } as any)
    return NextResponse.json({ success: true, changed })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao cancelar imagem." }, { status: 400 })
  }
}
