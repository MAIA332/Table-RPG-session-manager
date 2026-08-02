import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store } from "@/lib/store"
import { normalizeResources } from "@/lib/character"
import type { Character } from "@/lib/types"

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
  const canEdit = character.ownerId === user.id || role === "gm"
  if (!canEdit) return NextResponse.json({ error: "Sem permissao para editar." }, { status: 403 })

  const body = await request.json().catch(() => null)
  const currentResources = { ...character.resources }

  if (body.resources) character.resources = { ...character.resources, ...body.resources }
  if (body.skills) character.skills = body.skills
  if (body.attributes) character.attributes = body.attributes
  if (body.classes) character.classes = body.classes // Agora salvamos as classes que o frontend nos mandar!

  const patchRes = body?.resources ?? {}

  if (patchRes.xp !== undefined && role !== "gm") {
    delete patchRes.xp;
  }

  const nextRes = { ...currentResources, ...patchRes }
  
  const ALL_KEYS = ["hp", "mp", "ip", "fp", "xp"]
  for (const key of ALL_KEYS) {
    if (typeof patchRes[key] === "number") {
      (nextRes as any)[key] = patchRes[key]
    } else if (typeof currentResources[key as keyof typeof currentResources] === "number" && typeof (nextRes as any)[key] !== "number") {
      (nextRes as any)[key] = currentResources[key as keyof typeof currentResources]
    }
  }

  const nextSkills = body?.skills !== undefined ? body.skills : (character as any).skills || {}
  const nextClasses = body?.classes !== undefined ? body.classes : character.classes || []
  const nextEquipment = body?.equipment !== undefined ? body.equipment : character.equipment
  const nextZenit = body?.zenit !== undefined ? body.zenit : (character as any).zenit

  const updatedData = { 
    ...character, 
    resources: nextRes, 
    skills: nextSkills,
    classes: nextClasses, // Usa as classes atualizadas
    equipment: nextEquipment,
    zenit: nextZenit,
    updatedAt: Date.now() 
  } as unknown as Character

  const updated = normalizeResources(updatedData)
  
  ;(updated as any).skills = nextSkills;
  ;(updated as any).zenit = nextZenit;
  ;(updated as any).resources.xp = nextRes.xp;
  
  // Clampa o HP e MP dentro do limite seguro
  updated.resources.hp = Math.min(nextRes.hp, updated.resources.maxHp);
  updated.resources.mp = Math.min(nextRes.mp, updated.resources.maxMp);
  updated.resources.ip = Math.min(nextRes.ip, updated.resources.maxIp);
  updated.resources.fp = nextRes.fp;

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