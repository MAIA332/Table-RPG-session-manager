import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, store } from "@/lib/store"
import type { GameClass } from "@/lib/game-data"
import { visibleCustomClassesForUser } from "@/lib/class-audience"

export const dynamic = "force-dynamic"

/** Notificação leve, sem enviar classes restritas na mensagem pública do combate. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const campaign = store.campaigns.get(id)
  const role = campaign && getMemberRole(campaign, user.id)
  if (!role) return NextResponse.json({ error: "Sem acesso à campanha." }, { status: 403 })
  const raw = store.campaignState.get(id)?.customClasses
  const definitions = Array.isArray(raw) ? raw as GameClass[] : []
  return NextResponse.json({
    classes: visibleCustomClassesForUser(definitions, user.id, role === "gm"),
  }, { headers: { "Cache-Control": "private, no-store" } })
}
