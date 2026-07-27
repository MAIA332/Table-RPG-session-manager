import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { genId, getMemberRole, publish, store } from "@/lib/store"
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

  // valida atributos
  const attributes = body?.attributes as Record<AttributeKey, DieSize>
  for (const key of ATTR_KEYS) {
    if (!attributes || !VALID_DICE.includes(attributes[key])) {
      return NextResponse.json({ error: "Distribuicao de atributos invalida." }, { status: 400 })
    }
  }

  // valida classes: 2 a 3 classes somando 5 niveis
  const classes = (body?.classes ?? []) as ClassLevel[]
  const validClasses = classes.filter((c) => getClass(c.classId) && c.level > 0)
  const totalLevels = validClasses.reduce((s, c) => s + c.level, 0)
  if (validClasses.length < 2 || validClasses.length > 3 || totalLevels !== 5) {
    return NextResponse.json(
      { error: "Escolha de 2 a 3 classes somando exatamente 5 niveis." },
      { status: 400 },
    )
  }

  // valida equipamentos e orcamento
  const equipment = (body?.equipment ?? []) as string[]
  let spent = 0
  for (const id of equipment) {
    const item = getEquipment(id)
    if (!item) return NextResponse.json({ error: "Equipamento invalido." }, { status: 400 })
    spent += item.cost
  }
  if (spent > STARTING_ZENIT) {
    return NextResponse.json({ error: "Voce excedeu o orcamento de 500 zenit." }, { status: 400 })
  }

  const max = computeMaxResources(validClasses, attributes)
  const now = Date.now()
  const character: Character = {
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
    },
    createdAt: now,
    updatedAt: now,
  }
  store.characters.set(character.id, character)
  publish(campaignId, { type: "character:created", character })

  return NextResponse.json({ character })
}
