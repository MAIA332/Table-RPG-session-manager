import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, transactStore } from "@/lib/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

class XPError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

/** Concede/revoga apenas XP. Níveis de habilidades, classes e HP/MP não mudam. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const input = await request.json().catch(() => null)
  const delta = input && typeof input === "object" && !Array.isArray(input) ? input.delta : null
  // O cliente agrupa cliques em um único delta. Limitar a quantia por requisição.
  if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > 1_000_000) {
    return NextResponse.json({ error: "Ajuste de XP inválido." }, { status: 400 })
  }

  try {
    const result = await transactStore(db => {
      const current = db.characters.get(id)
      if (!current) throw new XPError("Personagem não encontrado.", 404)
      const campaign = db.campaigns.get(current.campaignId)
      if (!campaign || getMemberRole(campaign, user.id) !== "gm")
        throw new XPError("Apenas o Mestre pode alterar XP.", 403)

      const previous = Number.isSafeInteger(current.resources.xp) && current.resources.xp >= 0
        ? current.resources.xp : 0
      const xp = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, previous + delta))
      if (xp === previous) return { value: { character: current, changed: false }, changed: false }
      const character = {
        ...current,
        resources: { ...current.resources, xp },
        updatedAt: Math.max(Date.now(), current.updatedAt + 1),
      }
      db.characters.set(id, character)
      return { value: { character, changed: true }, changed: true }
    })
    if (result.changed) publish(result.character.campaignId, { type: "character:updated", character: result.character })
    return NextResponse.json({ character: result.character }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível ajustar o XP." },
      { status: error instanceof XPError ? error.status : 500 },
    )
  }
}
