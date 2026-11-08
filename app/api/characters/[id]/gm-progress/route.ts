import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, transactStore } from "@/lib/store"
import { getCampaignClassCatalog } from "@/lib/class-catalog"
import { computeMaxResources, normalizeResources } from "@/lib/character"
import { campaignItemCatalog } from "@/lib/inventory-server"
import { validateCustomCheck } from "@/lib/custom-checks"
import { deriveSkillClassLevels, progressionResourceDelta, reconcileGmFreeSkillRecords } from "@/lib/skill-progression"
import type { GameClass } from "@/lib/game-data"
import type { Character, AttributeKey, DieSize } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

class EditError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

const attributes: AttributeKey[] = ["dex", "ins", "mig", "wlp"]
const diePattern = /^d(?:4|6|8|10|12|14|16|18|20)$/

function validateAttributes(input: unknown): Character["attributes"] {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new EditError("Atributos inválidos.")
  const record = input as Record<string, unknown>
  if (Object.keys(record).some(key => !attributes.includes(key as AttributeKey)) ||
      attributes.some(key => typeof record[key] !== "string" || !diePattern.test(record[key] as string)))
    throw new EditError("Informe dados válidos (d6 a d20) para os quatro atributos.")
  return Object.fromEntries(attributes.map(key => [key, record[key] as DieSize])) as Character["attributes"]
}

function validateSkills(input: unknown): Character["skills"] {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new EditError("Habilidades inválidas.")
  const result: Record<string, number> = {}
  for (const [id, value] of Object.entries(input)) {
    if (!id || id.length > 120 || !Number.isSafeInteger(value) ||
        (value as number) < 0 || (value as number) > 999)
      throw new EditError("Níveis de habilidades inválidos.")
    result[id] = value as number
  }
  if (Object.keys(result).length > 500) throw new EditError("Muitas habilidades na ficha.")
  return result
}

function validateClasses(input: unknown): Character["classes"] {
  if (!Array.isArray(input) || input.length > 100) throw new EditError("Classes inválidas.")
  const seen = new Set<string>()
  return input.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new EditError("Classe inválida.")
    const classId = (item as Record<string, unknown>).classId
    const level = (item as Record<string, unknown>).level
    if (typeof classId !== "string" || !classId || classId.length > 120 ||
        seen.has(classId) || !Number.isSafeInteger(level) || (level as number) < 0 || (level as number) > 999)
      throw new EditError("Identificação ou nível de classe inválido.")
    seen.add(classId)
    return { classId, level: level as number }
  })
}

/**
 * Edição transacional e exclusiva do Mestre. Nível e recursos são derivados no
 * servidor, não recebidos do navegador. Concessões gratuitas contam porque
 * são armazenadas nos níveis de `skills` como qualquer outra evolução.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json({ error: "Edição inválida." }, { status: 400 })
  try {
    const input = body as Record<string, unknown>
    if (input.skills === undefined && input.attributes === undefined && input.classes === undefined)
      throw new EditError("Informe ao menos uma alteração.")
    const skills = input.skills === undefined ? undefined : validateSkills(input.skills)
    const attrs = input.attributes === undefined ? undefined : validateAttributes(input.attributes)
    const classes = input.classes === undefined ? undefined : validateClasses(input.classes)
    if (input.expectedUpdatedAt !== undefined && !Number.isSafeInteger(input.expectedUpdatedAt))
      throw new EditError("Versão da ficha inválida.")

    const updated = await transactStore(db => {
      const current = db.characters.get(id)
      if (!current) throw new EditError("Personagem não encontrado.", 404)
      const campaign = db.campaigns.get(current.campaignId)
      if (!campaign || getMemberRole(campaign, user.id) !== "gm")
        throw new EditError("Somente o Mestre pode editar esta progressão.", 403)
      if (input.expectedUpdatedAt !== undefined && current.updatedAt !== input.expectedUpdatedAt)
        throw new EditError("A ficha foi alterada. Atualize antes de editar novamente.", 409)

      const nextSkills = skills ?? current.skills
      const nextAttributes = attrs ?? current.attributes
      const selectedClasses = classes ?? current.classes
      const campaignCharacters = [...db.characters.values()].filter(c => c.campaignId === current.campaignId)
      const state = db.campaignState.get(current.campaignId) || {}
      const customClasses = (Array.isArray(state.customClasses) ? state.customClasses : []) as GameClass[]
      const catalog = getCampaignClassCatalog(campaignCharacters, customClasses)
      const nextClasses = deriveSkillClassLevels(selectedClasses, nextSkills, catalog)
      // Alterações manuais do Mestre são gratuitas e não gastam pontos de XP.
      // Mantém o histórico de compras do jogador intacto ao conceder/remover ranks.
      const freeSkillRecords = skills === undefined ? null : reconcileGmFreeSkillRecords(
        current.skills || {}, nextSkills,
        (current as Character & { customModifiers?: unknown }).customModifiers,
      )
      const growth = progressionResourceDelta(
        { classes: current.classes, skills: current.skills, attributes: current.attributes },
        { classes: nextClasses, skills: nextSkills, attributes: nextAttributes },
        catalog, (classes, attributes) => computeMaxResources(classes, attributes, catalog),
      )
      const limits = {
        maxHp: Math.max(1, current.resources.maxHp + growth.maxHp),
        maxMp: Math.max(0, current.resources.maxMp + growth.maxMp),
        maxIp: Math.max(0, current.resources.maxIp + growth.maxIp),
      }
      const resources = { ...current.resources, ...limits }
      if (input.resources !== undefined) {
        if (!input.resources || typeof input.resources !== "object" || Array.isArray(input.resources)) throw new EditError("Recursos inválidos.")
        for (const [key, value] of Object.entries(input.resources)) {
          if (!["hp", "mp", "maxHp", "maxMp", "maxIp", "xp", "fp"].includes(key)) continue
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new EditError("Recursos devem ser números não negativos.")
          if (key === "xp" && !Number.isSafeInteger(value)) throw new EditError("XP deve ser um inteiro.")
          ;(resources as any)[key] = value
        }
      }
      if (resources.maxHp < 1) throw new EditError("A vida máxima deve ser positiva.")
      if (input.name !== undefined && (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 160)) throw new EditError("Informe um nome de 1 a 160 caracteres.")
      if (input.zenit !== undefined && (typeof input.zenit !== "number" || !Number.isFinite(input.zenit) || input.zenit < 0)) throw new EditError("Zenits inválidos.")
      if (input.npcLevel !== undefined && (!Number.isSafeInteger(input.npcLevel) || Number(input.npcLevel) < 1 || Number(input.npcLevel) > 1000)) throw new EditError("Nível de NPC inválido.")
      if (input.npcChecks !== undefined && (!current.isNpc || !Array.isArray(input.npcChecks) || input.npcChecks.length > 100)) throw new EditError("Testes do NPC inválidos.")
      const next: Character = {
        ...current,
        ...(freeSkillRecords === null ? {} : { customModifiers: freeSkillRecords }),
        skills: structuredClone(nextSkills),
        classes: structuredClone(nextClasses),
        attributes: structuredClone(nextAttributes),
        ...(current.isNpc && current.npcLevel !== undefined && skills !== undefined
          ? { npcLevel: Math.max(1, current.npcLevel + Object.values(nextSkills).reduce((sum, rank) => sum + rank, 0) - Object.values(current.skills || {}).reduce((sum, rank) => sum + Math.max(0, Number(rank) || 0), 0)) } : {}),
        ...(typeof input.name === "string" ? { name: input.name.trim() } : {}),
        ...(typeof input.zenit === "number" ? { zenit: input.zenit } : {}),
        ...(typeof input.npcLevel === "number" ? { npcLevel: input.npcLevel } : {}),
        ...(Array.isArray(input.npcChecks) ? { npcChecks: input.npcChecks.map(validateCustomCheck).map(check => ({ ...check, isPublic: false })) } : {}),
        resources,
        updatedAt: Math.max(Date.now(), current.updatedAt + 1),
      }
      const normalized = normalizeResources(next, campaignItemCatalog(db, current.campaignId))
      db.characters.set(id, normalized)
      return { value: normalized, changed: true }
    })
    publish(updated.campaignId, { type: "character:updated", character: updated })
    return NextResponse.json({ character: updated }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar a progressão." },
      { status: error instanceof EditError ? error.status : 500 },
    )
  }
}
