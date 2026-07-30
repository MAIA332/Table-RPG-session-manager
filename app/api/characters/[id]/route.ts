import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store } from "@/lib/store"
import { normalizeResources } from "@/lib/character"
import type { CharacterResources, Character } from "@/lib/types"

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
  
  // O Mestre (GM) ou o dono do personagem podem editar a ficha
  const canEdit = character.ownerId === user.id || role === "gm"
  if (!canEdit) return NextResponse.json({ error: "Sem permissao para editar." }, { status: 403 })

  const body = await request.json().catch(() => null)
  
  const patchRes = body?.resources ?? {}

  // 🛡️ PROTEÇÃO DO MESTRE: Apenas o GM pode manipular o XP via API.
  // Se um jogador tentar enviar um PATCH alterando o XP, a API ignora essa linha silenciosamente.
  if (patchRes.xp !== undefined && role !== "gm") {
    delete patchRes.xp;
  }

  const nextRes = { ...character.resources, ...((character as any).resources || {}) }
  
  const ALL_KEYS = ["hp", "mp", "ip", "fp", "xp"]
  for (const key of ALL_KEYS) {
    if (typeof patchRes[key] === "number") {
      (nextRes as any)[key] = patchRes[key]
    }
  }

  // Captura os novos valores de Habilidades, Equipamentos e Zênit enviados
  const nextSkills = body?.skills !== undefined ? body.skills : (character as any).skills
  const nextEquipment = body?.equipment !== undefined ? body.equipment : character.equipment
  const nextZenit = body?.zenit !== undefined ? body.zenit : (character as any).zenit

  const updatedData = { 
    ...character, 
    resources: nextRes, 
    skills: nextSkills,
    equipment: nextEquipment,
    zenit: nextZenit,
    updatedAt: Date.now() 
  } as unknown as Character

  // O normalize garante que HP, MP e IP não ultrapassem o limite máximo da classe/atributos
  const updated = normalizeResources(updatedData)
  
  // Garantia de injeção de propriedades customizadas (evita que o normalize apague dados não listados na tipagem estrita)
  ;(updated as any).skills = nextSkills;
  ;(updated as any).zenit = nextZenit;
  ;(updated as any).resources.xp = nextRes.xp;

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