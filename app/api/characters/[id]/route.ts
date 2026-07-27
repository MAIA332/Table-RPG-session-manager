import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store } from "@/lib/store"
import { normalizeResources } from "@/lib/character"
import type { CharacterResources } from "@/lib/types"

const RESOURCE_KEYS: (keyof CharacterResources)[] = ["hp", "mp", "ip", "fp"]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 })

  const { id } = await params
  const character = store.characters.get(id)
  if (!character) return NextResponse.json({ error: "Personagem nao encontrado." }, { status: 404 })

  const campaign = store.campaigns.get(character.campaignId)
  if (!campaign) return NextResponse.json({ error: "Campanha nao encontrada." }, { status: 404 })

  const role = getMemberRole(campaign, user.id)
  // Dono do personagem ou o GM podem editar os recursos
  const canEdit = character.ownerId === user.id || role === "gm"
  if (!canEdit) return NextResponse.json({ error: "Sem permissao para editar." }, { status: 403 })

  const body = await request.json().catch(() => null)
  const patch = body?.resources ?? {}
  const next = { ...character.resources }
  for (const key of RESOURCE_KEYS) {
    if (typeof patch[key] === "number") {
      next[key] = patch[key]
    }
  }

  const updated = normalizeResources({ ...character, resources: next, updatedAt: Date.now() })
  store.characters.set(id, updated)
  publish(character.campaignId, { type: "character:updated", character: updated })

  return NextResponse.json({ character: updated })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 })

  const { id } = await params
  const character = store.characters.get(id)
  if (!character) return NextResponse.json({ error: "Personagem nao encontrado." }, { status: 404 })

  const campaign = store.campaigns.get(character.campaignId)
  const role = campaign ? getMemberRole(campaign, user.id) : undefined
  if (character.ownerId !== user.id && role !== "gm")
    return NextResponse.json({ error: "Sem permissao." }, { status: 403 })

  store.characters.delete(id)
  publish(character.campaignId, { type: "character:deleted", characterId: id })
  return NextResponse.json({ ok: true })
}
