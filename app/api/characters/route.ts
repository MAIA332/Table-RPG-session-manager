import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { genId, getMemberRole, publish, saveToDisk, store } from "@/lib/store"
import { computeMaxResources } from "@/lib/character"
import { STARTING_ZENIT, getClass, getEquipment } from "@/lib/game-data"
import type { AttributeKey, Character, ClassLevel, DieSize } from "@/lib/types"

const ATTR_KEYS: AttributeKey[] = ["dex", "ins", "mig", "wlp"]
const VALID_DICE: DieSize[] = ["d6", "d8", "d10", "d12"]

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 })

  const body = await request.json().catch(() => null)
  const campaignId = String(body?.campaignId ?? "")
  const campaign = store.campaigns.get(campaignId)
  if (!campaign) return NextResponse.json({ error: "Campanha nao encontrada." }, { status: 404 })
  if (!getMemberRole(campaign, user.id))
    return NextResponse.json({ error: "Voce nao participa desta campanha." }, { status: 403 })

  const name = String(body?.name ?? "").trim()
  if (!name) return NextResponse.json({ error: "Informe um nome de heroi." }, { status: 400 })

  const attributes = body?.attributes as Record<AttributeKey, DieSize>
  const classes = (body?.classes ?? []) as ClassLevel[]
  const validClasses = classes.filter((c) => getClass(c.classId) && c.level > 0)

  const equipment = (body?.equipment ?? []) as string[]
  let spent = 0
  for (const id of equipment) {
    const item = getEquipment(id)
    if (item) spent += item.cost
  }

  const max = computeMaxResources(validClasses, attributes)
  const now = Date.now()
  
  const character: any = {
    id: genId("char"),
    campaignId,
    ownerId: user.id,
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
  
  store.characters.set(character.id, character as Character)
  store.characterTombstones.delete(character.id)
  saveToDisk(store)
  publish(campaignId, { type: "character:created", character })

  return NextResponse.json({ character })
}
