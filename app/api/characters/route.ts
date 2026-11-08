import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { genId, getMemberRole, publish, saveToDisk, store } from "@/lib/store"
import { applyInventoryRules, computeMaxResources } from "@/lib/character"
import { STARTING_ZENIT, getClass, getEquipment } from "@/lib/game-data"
import type { AttributeKey, Character, ClassLevel, DieSize } from "@/lib/types"
import { CLASSES, type GameClass } from "@/lib/game-data"
import { validateCustomCheck } from "@/lib/custom-checks"
import { canPlayerAcquireClass } from "@/lib/class-visibility"
import { readCampaignDeathTokens } from "@/lib/death-tokens-server"

const ATTR_KEYS: AttributeKey[] = ["dex", "ins", "mig", "wlp"]
const VALID_DICE: DieSize[] = ["d6", "d8", "d10", "d12"]

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 })

  const body = await request.json().catch(() => null)
  const campaignId = String(body?.campaignId ?? "")
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return NextResponse.json({ error: "Campanha nao encontrada." }, { status: 404 })
  const role = getMemberRole(campaign, user.id)
  if (!role)
    return NextResponse.json({ error: "Voce nao participa desta campanha." }, { status: 403 })

  const name = String(body?.name ?? "").trim()
  if (!name) return NextResponse.json({ error: "Informe um nome de heroi." }, { status: 400 })

  const attributes = body?.attributes as Record<AttributeKey, DieSize>
  if (!attributes || !ATTR_KEYS.every(key => /^d(4|6|8|10|12|14|16|18|20)$/.test(attributes[key])))
    return NextResponse.json({ error: "Atributos inválidos." }, { status: 400 })
  const custom = store.campaignState.get(campaignId)?.customClasses
  const customDefinitions = Array.isArray(custom) ? custom as GameClass[] : []
  const catalog = [...customDefinitions, ...CLASSES]
  const classes = (body?.classes ?? []) as ClassLevel[]
  if (!Array.isArray(classes) || classes.some(c => !c || typeof c.classId !== "string" || !Number.isSafeInteger(c.level) || c.level < 0 || c.level > 1000))
    return NextResponse.json({ error: "Classes inválidas." }, { status: 400 })
  const validClasses = classes.filter((c) => catalog.some(definition => definition.id === c.classId) && c.level > 0)
  if (role !== "gm") {
    const token = readCampaignDeathTokens(store.campaignState.get(campaignId)).find(entry => entry.id === body?.tokenId && entry.userId === user.id && entry.status === "available")
    const granted = new Set(token?.allowedClassIds || [])
    const permitted = (definition: GameClass) => granted.has(definition.id) || Boolean(definition.parentClassId && granted.has(definition.parentClassId)) || canPlayerAcquireClass(definition.id, customDefinitions, { userId: user.id })
    if (validClasses.some(entry => !permitted(catalog.find(def => def.id === entry.classId)!)) ||
        customDefinitions.some(definition => !permitted(definition) && definition.skills.some(skill => Number(body?.skills?.[skill.id] || 0) > 0)))
      return NextResponse.json({ error: "Esta classe pode ser consultada, mas não está liberada para você adquirir." }, { status: 403 })
  }

  const equipment = (body?.equipment ?? []) as string[]
  let spent = 0
  for (const id of equipment) {
    const item = getEquipment(id)
    if (item) spent += item.cost
  }

  const max = computeMaxResources(validClasses, attributes, catalog)
  const isNpc = role === "gm" && body?.isNpc === true
  let npcChecks
  try {
    npcChecks = isNpc && Array.isArray(body.npcChecks) ? body.npcChecks.map(validateCustomCheck).map((check: import("@/lib/custom-checks").CustomCheck) => ({ ...check, isPublic: false })) : undefined
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Testes inválidos." }, { status: 400 }) }
  const npcResources = isNpc && body.resources && typeof body.resources === "object" ? body.resources : {}
  for (const key of ["hp", "maxHp", "mp", "maxMp", "maxIp", "xp", "fp"]) {
    if (npcResources[key] !== undefined && (!Number.isFinite(npcResources[key]) || npcResources[key] < 0))
      return NextResponse.json({ error: "Recursos do NPC inválidos." }, { status: 400 })
  }
  const now = Date.now()
  
  const character: any = {
    id: genId("char"),
    campaignId,
    ownerId: user.id,
    ...(isNpc ? { isNpc: true, npcLevel: Math.max(1, Math.floor(Number(body.npcLevel) || validClasses.reduce((sum, entry) => sum + entry.level, 0) || 1)), npcChecks,
      customModifiers: Array.isArray(body.customModifiers) ? body.customModifiers : [], bestiaryAffinities: body.bestiaryAffinities } : {}),
    name,
    avatarUrl: String(body?.avatarUrl ?? "") || "/mystic-adventurer-portrait.png",
    origin: String(body?.origin ?? "").trim(),
    identity: String(body?.identity ?? "").trim(),
    theme: String(body?.theme ?? "").trim(),
    attributes,
    classes: validClasses,
    equipment,
    zenit: STARTING_ZENIT - spent,
    resources: {
      hp: max.maxHp,
      maxHp: max.maxHp,
      mp: max.maxMp,
      maxMp: max.maxMp,
      ip: max.maxIp,
      maxIp: max.maxIp,
      fp: 0,
      xp: 0
    },
    skills: body?.skills || {},
    createdAt: now,
    updatedAt: now,
  }
  if (isNpc) {
    character.resources = { ...character.resources, ...npcResources }
    if (npcResources.hp === undefined) character.resources.hp = character.resources.maxHp
    if (npcResources.mp === undefined) character.resources.mp = character.resources.maxMp
    character.resources.hp = Math.min(character.resources.hp, character.resources.maxHp)
    character.resources.mp = Math.min(character.resources.mp, character.resources.maxMp)
  }
  
  const normalizedCharacter = applyInventoryRules(character as Character)
  store.characters.set(character.id, normalizedCharacter)
  store.characterTombstones.delete(character.id)
  await saveToDisk(store)
  publish(campaignId, { type: "character:created", character: normalizedCharacter })

  return NextResponse.json({ character: normalizedCharacter })
}
