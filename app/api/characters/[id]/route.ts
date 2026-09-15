import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { deleteCharacterFromStore, getMemberRole, publish, saveToDisk, store } from "@/lib/store"
import { normalizeResources } from "@/lib/character"
import { normalizePortraitCrop, normalizePortraitFrame } from "@/lib/portrait-frames"
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
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  const changesPortrait = body.avatarUrl !== undefined || body.portraitCrop !== undefined
  if (changesPortrait && character.ownerId !== user.id) {
    return NextResponse.json({ error: "Apenas o dono pode alterar o retrato." }, { status: 403 })
  }
  const requestedAvatar = body.avatarUrl !== undefined ? String(body.avatarUrl).trim() : character.avatarUrl
  const validAvatar = requestedAvatar.startsWith("/")
    || /^https?:\/\//i.test(requestedAvatar)
    || /^data:image\/(png|jpe?g|webp|gif|avif);base64,/i.test(requestedAvatar)
  if (body.avatarUrl !== undefined && (!validAvatar || requestedAvatar.length > 3_500_000)) {
    return NextResponse.json({ error: "Imagem de retrato inválida ou muito grande." }, { status: 400 })
  }
  const currentResources = { ...character.resources }

  if (body.resources) character.resources = { ...character.resources, ...body.resources }
  if (body.skills) character.skills = body.skills
  if (body.attributes) character.attributes = body.attributes
  if (body.classes) character.classes = body.classes

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
  const nextZenit = body?.zenit !== undefined ? Math.max(0, Number(body.zenit) || 0) : (character as any).zenit
  const nextCustomModifiers = body?.customModifiers !== undefined ? body.customModifiers : (character as any).customModifiers || [] // <-- Pega as condições
  const nextCustomItems = body?.customItems !== undefined ? body.customItems : (character as any).customItems || [] // <-- Pega os itens costumizados
  const nextOrigin = body?.origin !== undefined ? String(body.origin).trim().slice(0, 20_000) : character.origin
  const nextIdentity = body?.identity !== undefined ? String(body.identity).trim().slice(0, 20_000) : character.identity
  const nextTheme = body?.theme !== undefined ? String(body.theme).trim().slice(0, 20_000) : character.theme

  const nextPortraitFrame = body?.portraitFrame !== undefined ? normalizePortraitFrame(body.portraitFrame) : normalizePortraitFrame(character.portraitFrame)
  const nextPortraitCrop = body?.portraitCrop !== undefined ? normalizePortraitCrop(body.portraitCrop) : normalizePortraitCrop(character.portraitCrop)

  const updatedData = { 
    ...character, 
    resources: nextRes, 
    skills: nextSkills,
    classes: nextClasses,
    equipment: nextEquipment,
    zenit: nextZenit,
    customModifiers: nextCustomModifiers,
    customItems: nextCustomItems,
    origin: nextOrigin,
    identity: nextIdentity,
    theme: nextTheme,
    avatarUrl: requestedAvatar,
    portraitFrame: nextPortraitFrame,
    portraitCrop: nextPortraitCrop,
    updatedAt: Math.max(Date.now(), Number(character.updatedAt || 0) + 1)
  } as unknown as Character

  const updated = normalizeResources(updatedData)
  
  // Garantir que os campos que não existem estritamente na tipagem original do normalize sejam passados adiante
  ;(updated as any).skills = nextSkills;
  ;(updated as any).zenit = nextZenit;
  ;(updated as any).resources.xp = nextRes.xp;
  ;(updated as any).customItems = nextCustomItems;
  updated.portraitFrame = nextPortraitFrame;
  updated.portraitCrop = nextPortraitCrop;

  // Clampa o HP e MP dentro do limite seguro
  updated.resources.hp = Math.min(nextRes.hp, updated.resources.maxHp);
  updated.resources.mp = Math.min(nextRes.mp, updated.resources.maxMp);
  updated.resources.fp = nextRes.fp;

  store.characters.set(id, updated)
  saveToDisk(store)
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

  deleteCharacterFromStore(id)
  saveToDisk(store)
  publish(character.campaignId, { type: "character:deleted", characterId: id })
  return NextResponse.json({ ok: true })
}
