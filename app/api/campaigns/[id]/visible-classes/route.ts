import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store } from "@/lib/store"
import type { GameClass } from "@/lib/game-data"
import { visibleCustomClassesForUser } from "@/lib/class-audience"

export const dynamic = "force-dynamic"

/** Catálogo leve e específico da ficha. Nunca confie num characterId não autorizado. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const campaign = store.campaigns.get(id)
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada." }, { status: 404 })
  const role = getMemberRole(campaign, user.id)
  if (!role) return NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 })
  const characterId = new URL(request.url).searchParams.get("characterId")
  if (!characterId) return NextResponse.json({ error: "Informe o personagem." }, { status: 400 })
  const character = store.characters.get(characterId)
  if (!character || character.campaignId !== id || (role !== "gm" && character.ownerId !== user.id)) {
    return NextResponse.json({ error: "Personagem não autorizado." }, { status: 403 })
  }
  const definitions = store.campaignState.get(id)?.customClasses
  const custom = Array.isArray(definitions) ? definitions as GameClass[] : []
  return NextResponse.json({
    classes: visibleCustomClassesForUser(custom, user.id, role === "gm", character.id),
  }, { headers: { "Cache-Control": "private, no-store" } })
}
