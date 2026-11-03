import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { applyCharacterVitalChanges, getMemberRole, store, type CharacterVitalChange, publish } from "@/lib/store"
import type { RealtimeEvent } from "@/lib/types"

export const dynamic = "force-dynamic"

type VitalKey = "hp" | "mp"

function parseChange(value: unknown): CharacterVitalChange | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.mode !== "delta" && record.mode !== "max" && record.mode !== "min") return null
  if (typeof record.amount !== "number" || !Number.isSafeInteger(record.amount) ||
      Math.abs(record.amount) > 1_000_000) return null
  return { mode: record.mode, amount: record.amount }
}

/**
 * Endpoint exclusivamente de vitalidade. Não aceita XP, LP, IP, máximos,
 * atributos ou modificadores. Permissão: Mestre ou dono da ficha.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const current = store.characters.get(id)
  if (!current) return NextResponse.json({ error: "Personagem não encontrado." }, { status: 404 })
  const campaign = store.campaigns.get(current.campaignId)
  const role = campaign ? getMemberRole(campaign, user.id) : undefined
  if (!role || (role !== "gm" && current.ownerId !== user.id)) {
    return NextResponse.json({ error: "Sem permissão para alterar HP/MP." }, { status: 403 })
  }
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !body.changes || typeof body.changes !== "object" || Array.isArray(body.changes)) {
    return NextResponse.json({ error: "Ajuste de recursos inválido." }, { status: 400 })
  }
  const input = body.changes as Record<string, unknown>
  const keys = Object.keys(input)
  if (!keys.length || keys.some(key => key !== "hp" && key !== "mp")) {
    return NextResponse.json({ error: "Somente HP e MP podem ser modificados nesta rota." }, { status: 400 })
  }
  const changes: Partial<Record<VitalKey, CharacterVitalChange>> = {}
  for (const key of keys as VitalKey[]) {
    const change = parseChange(input[key])
    if (!change) return NextResponse.json({ error: `Ajuste de ${key.toUpperCase()} inválido.` }, { status: 400 })
    changes[key] = change
  }
  try {
    const updated = await applyCharacterVitalChanges(id, changes)
    const deathRelevant = current.resources.hp !== updated.resources.hp &&
      (current.resources.hp <= 0 || updated.resources.hp <= 0)
    // Mantém o evento existente. Marcadores opcionais permitem que a sala evite
    // baixar todo o inventário para cada atualização isolada de HP/MP.
    publish(updated.campaignId, {
      type: "character:updated", character: updated, vitalsOnly: true, deathRelevant,
    } as unknown as RealtimeEvent)
    return NextResponse.json({ character: updated }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (cause) {
    console.error("[CHARACTER_VITALS] Falha ao salvar HP/MP", { characterId: id }, cause)
    return NextResponse.json({ error: "Não foi possível persistir a alteração de HP/MP." }, { status: 500 })
  }
}
