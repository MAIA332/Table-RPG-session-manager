import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { genId, getMemberRole, publish, store, transactStore } from "@/lib/store"
import { BASE_MAX_IP, CLASSES, type GameClass } from "@/lib/game-data"
import { computeMaxResources, applyInventoryRules } from "@/lib/character"
import { assertInventoryFits } from "@/lib/inventory-weight"
import { isClassPublished } from "@/lib/class-visibility"
import type { AttributeKey, Character, ClassLevel, DieSize } from "@/lib/types"
import { creatorEquipmentCatalog, readCampaignDeathTokens, withCampaignDeathTokens } from "@/lib/death-tokens-server"

export const dynamic = "force-dynamic"
type Params = { params: Promise<{ id: string }> }
type CreationInput = {
  tokenId?: unknown; requestId?: unknown; name?: unknown; avatarUrl?: unknown
  origin?: unknown; identity?: unknown; theme?: unknown; classes?: unknown
  skills?: unknown; attributes?: unknown; equipment?: unknown; customItems?: unknown
}
class ForgeError extends Error { constructor(message: string, public status = 400) { super(message) } }
function fail(error: unknown) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível forjar o herói." }, { status: error instanceof ForgeError ? error.status : 500 }) }
const ATTRIBUTES: AttributeKey[] = ["dex", "ins", "mig", "wlp"]
const DICE = new Set(["d6", "d8", "d10", "d12"])
const safeText = (x: unknown, label: string, max = 1000) => {
  if (typeof x !== "string" || x.length > max) throw new ForgeError(`${label} inválido.`)
  return x.trim()
}

function validateInputs(input: CreationInput, maxLevels: number, catalog: GameClass[], allowedIds: string[], catalogueItems: ReturnType<typeof creatorEquipmentCatalog>) {
  const name = safeText(input.name, "Nome", 120)
  if (!name) throw new ForgeError("Informe o nome do herói.")
  const avatarUrl = safeText(input.avatarUrl || "", "Retrato", 2048)
  if (avatarUrl && !(avatarUrl.startsWith("/") || /^https:\/\//i.test(avatarUrl))) throw new ForgeError("Use uma URL HTTPS pública para o retrato.")
  const origin = safeText(input.origin || "", "Origem", 12000)
  const identity = safeText(input.identity || "", "Identidade", 12000)
  const theme = safeText(input.theme || "", "Tema", 12000)
  if (!input.attributes || typeof input.attributes !== "object" || Array.isArray(input.attributes)) throw new ForgeError("Atributos inválidos.")
  const attributes = {} as Record<AttributeKey, DieSize>
  for (const key of ATTRIBUTES) {
    const die = (input.attributes as Record<string, unknown>)[key]
    if (!DICE.has(String(die))) throw new ForgeError(`Dado ${key.toUpperCase()} inválido.`)
    attributes[key] = die as DieSize
  }
  if (!input.skills || typeof input.skills !== "object" || Array.isArray(input.skills)) throw new ForgeError("Habilidades inválidas.")
  const skillLevels = input.skills as Record<string, unknown>
  const allowedBases = catalog.filter(cls => !cls.parentClassId)
    .filter(cls => !allowedIds.length || allowedIds.includes(cls.id))
  const allowedSkill = new Map(allowedBases.flatMap(cls => cls.skills.map(skill => [skill.id, { skill, classId: cls.id }] as const)))
  const levels: Record<string, number> = {}
  for (const [skillId, raw] of Object.entries(skillLevels)) {
    const rank = Number(raw)
    const found = allowedSkill.get(skillId)
    if (!found || !Number.isSafeInteger(rank) || rank < 0 || rank > found.skill.maxLevel)
      throw new ForgeError("Habilidade ou nível inválido para as classes iniciais.")
    if (rank > 0) levels[skillId] = rank
  }
  const total = Object.values(levels).reduce((sum, n) => sum + n, 0)
  if (total < 1 || total > maxLevels) throw new ForgeError(`Distribua entre 1 e ${maxLevels} níveis.`)
  const classes: ClassLevel[] = allowedBases.flatMap(cls => {
    const level = cls.skills.reduce((sum, skill) => sum + (levels[skill.id] || 0), 0)
    return level ? [{ classId: cls.id, level }] : []
  })
  if (!Array.isArray(input.classes) || input.classes.length !== classes.length ||
    input.classes.some(entry => !entry || typeof entry !== "object" ||
      !classes.some(cls => cls.classId === entry.classId && cls.level === entry.level)))
    throw new ForgeError("As classes selecionadas não correspondem aos níveis das habilidades.")
  if (!Array.isArray(input.equipment) || input.equipment.length > 60 ||
    input.equipment.some(id => typeof id !== "string")) throw new ForgeError("Equipamento inicial inválido.")
  if (input.customItems && (!Array.isArray(input.customItems) || input.customItems.length))
    throw new ForgeError("Itens personalizados são definidos exclusivamente pelo Mestre.")
  const byId = new Map(catalogueItems.map(item => [item.id, item]))
  const selected = input.equipment as string[]
  if (new Set(selected).size !== selected.length || selected.some(id => !byId.has(id)))
    throw new ForgeError("Equipamento duplicado ou inexistente.")
  return { name, avatarUrl, origin, identity, theme, attributes, levels, classes, equipment: selected }
}

/** Este POST é a única via de uso do token. Validação e débito ocorrem na mesma
 * operação persistida da criação do personagem, evitando gasto por simples clique.
 * O requestId é idempotente, inclusive em retry após timeout do cliente. */
export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id: campaignId } = await params
  const input = await request.json().catch(() => null) as CreationInput | null
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 })
  const tokenId = typeof input.tokenId === "string" ? input.tokenId.trim() : ""
  const requestId = typeof input.requestId === "string" ? input.requestId.trim() : ""
  if (!tokenId || tokenId.length > 150 || requestId.length < 12 || requestId.length > 150)
    return NextResponse.json({ error: "Token ou identificador da criação inválido." }, { status: 400 })
  try {
    const result = await transactStore(draft => {
      const campaign = draft.campaigns.get(campaignId)
      if (!campaign) throw new ForgeError("Campanha não encontrada.", 404)
      if (!getMemberRole(campaign, user.id)) throw new ForgeError("Sem acesso à campanha.", 403)
      const state = draft.campaignState.get(campaignId)
      const tokens = readCampaignDeathTokens(state)
      const token = tokens.find(t => t.id === tokenId && t.userId === user.id)
      if (!token) throw new ForgeError("Token não pertence a esta conta.", 403)
      const receipts = Array.isArray(state?.deathTokenCreationReceipts)
        ? state.deathTokenCreationReceipts as Array<{ userId: string; requestId: string; characterId: string; tokenId: string }> : []
      const previous = receipts.find(r => r.userId === user.id && r.requestId === requestId)
      if (previous) {
        if (previous.tokenId !== tokenId) throw new ForgeError("Identificador já utilizado por outro token.", 409)
        const character = draft.characters.get(previous.characterId)
        if (!character) throw new ForgeError("Criação anterior em verificação. Consulte o Mestre.", 409)
        return { value: { character, created: false }, changed: false }
      }
      if (token.status !== "available") throw new ForgeError("Token já utilizado ou revogado.", 409)
      // O catálogo é reconstruído com dados do snapshot transacional. Não se confia nas classes enviadas no POST.
      const custom = Array.isArray(state?.customClasses) ? state.customClasses as GameClass[] : []
      const exclusive = new Set(token.allowedClassIds)
      const visibleCustom = custom.filter(cls => isClassPublished(cls) || exclusive.has(cls.id))
      const catalogMap = new Map<string, GameClass>()
      for (const cls of [...CLASSES, ...visibleCustom]) catalogMap.set(cls.id, cls)
      const catalog = [...catalogMap.values()].filter(cls => !cls.parentClassId || catalogMap.has(cls.parentClassId))
      const catalogItems = creatorEquipmentCatalog(campaignId)
      const valid = validateInputs(input, token.maxLevels, catalog, token.allowedClassIds, catalogItems)
      const itemsById = new Map(catalogItems.map(item => [item.id, item]))
      if (token.startingItemIds.some(itemId => !itemsById.has(itemId))) throw new ForgeError("Um item concedido foi excluído do catálogo. Contate o Mestre.", 409)
      if (valid.equipment.some(itemId => itemsById.get(itemId)?.purchasable === false && !token.startingItemIds.includes(itemId)))
        throw new ForgeError("Um item selecionado não pode ser comprado inicialmente.", 403)
      if (valid.equipment.some(itemId => token.startingItemIds.includes(itemId)))
        throw new ForgeError("Um item gratuito já será concedido pelo Mestre. Não o compre novamente.")
      if (valid.equipment.some(itemId => {
        const cost = Number(itemsById.get(itemId)?.cost)
        return !Number.isSafeInteger(cost) || cost < 0
      })) throw new ForgeError("O catálogo possui um preço inicial inválido. Avise o Mestre.", 409)
      const spent = valid.equipment.reduce((sum, itemId) => sum + Number(itemsById.get(itemId)!.cost), 0)
      if (!Number.isSafeInteger(spent) || spent < 0 || spent > token.startingZenit)
        throw new ForgeError("Os itens ultrapassam os Zenits configurados pelo Mestre.")
      const equipment = [...token.startingItemIds, ...valid.equipment]
      const customItems = (token.startingRelics || []).map(relic => ({
        id: genId("relic"), name: relic.name, content: relic.content,
        type: "text" as const, weight: relic.weight, weightUnit: relic.weightUnit,
      }))
      const resourcesPreview = computeMaxResources(valid.classes.filter(entry => CLASSES.some(cls => cls.id === entry.classId)), valid.attributes)
      const customLevels = valid.classes.filter(entry => !CLASSES.some(cls => cls.id === entry.classId))
      const maxHp = Math.max(1, resourcesPreview.maxHp + customLevels.reduce((sum, entry) =>
        sum + (Number(catalogMap.get(entry.classId)?.hpPerLevel) || 0) * entry.level, 0))
      const maxMp = Math.max(0, resourcesPreview.maxMp + customLevels.reduce((sum, entry) =>
        sum + (Number(catalogMap.get(entry.classId)?.mpPerLevel) || 0) * entry.level, 0))
      const maxIp = resourcesPreview.maxIp || BASE_MAX_IP
      assertInventoryFits({ equipment, attributes: valid.attributes, resources: { maxIp }, customItems }, catalogItems as any)
      const now = Date.now()
      const newCharacter: Character = {
        id: genId("char"), campaignId, ownerId: user.id,
        name: valid.name, avatarUrl: valid.avatarUrl || "/mystic-adventurer-portrait.png",
        origin: valid.origin, identity: valid.identity, theme: valid.theme,
        classes: valid.classes, skills: valid.levels, attributes: valid.attributes,
        equipment, customItems,
        zenit: token.startingZenit - spent,
        resources: { hp: maxHp, maxHp, mp: maxMp, maxMp, ip: maxIp, maxIp, xp: 0, fp: 0, lp: 0 },
        createdAt: now, updatedAt: now,
      } as Character
      const character = applyInventoryRules(newCharacter, catalogItems as any)
      draft.characters.set(character.id, character)
      const updated = tokens.map(item => item.id === token.id ? {
        ...item, status: "used" as const, usedAt: now, usedCharacterId: character.id,
      } : item)
      draft.campaignState.set(campaignId, {
        ...withCampaignDeathTokens(state, updated),
        deathTokenCreationReceipts: [...receipts, { userId: user.id, requestId, characterId: character.id, tokenId }],
      })
      return { value: { character, created: true }, changed: true }
    })
    if (result.created) publish(campaignId, { type: "character:created", character: result.character } as Parameters<typeof publish>[1])
    return NextResponse.json({ character: result.character, tokenConsumed: true })
  } catch (error) { return fail(error) }
}

