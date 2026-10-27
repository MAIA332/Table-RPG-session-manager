import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getMemberRole, publish, store, transactStore } from "@/lib/store"
import { computeMaxResources, normalizeResources } from "@/lib/character"
import { campaignItemCatalog } from "@/lib/inventory-server"
import type { Character } from "@/lib/types"
import {
  TRAINING_ATTRIBUTES, TRAINING_OPTIONS, trainingGoal, spendTrainingUpgrade,
  fatigueModifier, nextAttributeDie, normalizeTraining, settleTraining,
  type TrainingAttribute, type TrainingHours, type TrainingState,
} from "@/lib/training-model"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
type TrainedCharacter = Character & { training?: TrainingState; customModifiers?: any[] }
class TrainingError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** A condição é derivada do estado protegido; não depende de PATCH enviado pelo navegador. */
function withFatigue(character: TrainedCharacter, training: TrainingState, now: number): TrainedCharacter {
  const retained = (Array.isArray(character.customModifiers) ? character.customModifiers : [])
    .filter((entry: any) => entry?.type !== "training_fatigue" && entry?.id !== "training_fatigue")
  const fatigue = fatigueModifier(training, now)
  return {
    ...character,
    training,
    customModifiers: fatigue ? [...retained, fatigue] : retained,
    updatedAt: Math.max(now, (character.updatedAt || 0) + 1),
  } as TrainedCharacter
}

function errorResponse(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Falha ao atualizar treinamento." },
    { status: error instanceof TrainingError ? error.status : 500 },
  )
}

async function access(id: string) {
  const user = await getCurrentUser()
  if (!user) throw new TrainingError("Não autenticado.", 401)
  const character = store.characters.get(id) as TrainedCharacter | undefined
  if (!character) throw new TrainingError("Personagem não encontrado.", 404)
  const campaign = store.campaigns.get(character.campaignId)
  const role = campaign && getMemberRole(campaign, user.id)
  if (!role) throw new TrainingError("Sem acesso à campanha.", 403)
  return { user, role, character }
}

async function settleIfDue(id: string) {
  const stored = store.characters.get(id) as TrainedCharacter | undefined
  if (!stored) throw new TrainingError("Personagem não encontrado.", 404)
  const now = Date.now()
  if (!stored.training?.active || stored.training.active.endsAt > now) return stored
  const updated = await transactStore(db => {
    const current = db.characters.get(id) as TrainedCharacter | undefined
    if (!current) throw new TrainingError("Personagem não encontrado.", 404)
    const { state, completed } = settleTraining(current.training, Date.now())
    if (!completed) return { value: current, changed: false }
    const next = withFatigue(current, state, Date.now())
    db.characters.set(id, next)
    return { value: next, changed: true }
  }) as TrainedCharacter
  if (updated.updatedAt !== stored.updatedAt)
    publish(updated.campaignId, { type: "character:updated", character: updated })
  return updated
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { role, user, character: subject } = await access(id)
    if (role !== "gm" && subject.ownerId !== user.id)
      throw new TrainingError("Sem permissão para consultar esta ficha.", 403)
    const character = await settleIfDue(id)
    return NextResponse.json({ character, training: normalizeTraining(character.training), serverNow: Date.now() },
      { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { user, role, character } = await access(id)
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new TrainingError("Dados inválidos.")
    const action = String(body.action || "")
    if (action === "award" || action === "finish") {
      if (role !== "gm") throw new TrainingError("Ação exclusiva do Mestre.", 403)
    } else if (action === "start" || action === "upgrade") {
      if (role !== "gm" && character.ownerId !== user.id)
        throw new TrainingError("Somente o dono da ficha ou o Mestre pode executar essa ação.", 403)
    } else throw new TrainingError("Ação inválida.")

    const updated = await transactStore(db => {
      const current = db.characters.get(id) as TrainedCharacter | undefined
      if (!current) throw new TrainingError("Personagem não encontrado.", 404)
      const currentCampaign = db.campaigns.get(current.campaignId)
      const currentRole = currentCampaign && getMemberRole(currentCampaign, user.id)
      if (!currentRole) throw new TrainingError("Sem acesso à campanha.", 403)
      if ((action === "finish" || action === "award") && currentRole !== "gm")
        throw new TrainingError("Ação exclusiva do Mestre.", 403)
      if ((action === "start" || action === "upgrade") && currentRole !== "gm" && current.ownerId !== user.id)
        throw new TrainingError("Somente o dono da ficha ou o Mestre pode executar essa ação.", 403)
      const now = Date.now()
      const settled = settleTraining(current.training, now)
      let training = settled.state
      const attribute = body.attribute as TrainingAttribute
      let next = structuredClone(current) as TrainedCharacter

      if (action === "start") {
        const hours = Number(body.hours) as TrainingHours
        const option = TRAINING_OPTIONS[hours]
        if (!TRAINING_ATTRIBUTES.includes(attribute) || !option)
          throw new TrainingError("Atributo ou duração de treinamento inválidos.")
        if (training.active) throw new TrainingError("Já existe treinamento em andamento.", 409)
        if (training.fatigue && training.fatigue.endsAt > now)
          throw new TrainingError("Aguarde a recuperação de Cansado para começar um novo treino.", 409)
        training.active = { attribute, hours, startedAt: now, endsAt: now + option.realMinutes * 60_000 }
      } else if (action === "finish") {
        if (training.active) {
          training.active.endsAt = now
          training = settleTraining(training, now).state
        } else if (!settled.completed) {
          throw new TrainingError("Nenhum treinamento em andamento.", 409)
        }
      } else if (action === "award") {
        const amount = Number(body.points)
        if (!TRAINING_ATTRIBUTES.includes(attribute) || ![0.5, 1, 1.5, 2, 2.5].includes(amount))
          throw new TrainingError("Informe um atributo e 0,5 / 1 / 1,5 / 2 / 2,5 pontos.")
        training.points[attribute] = Math.round((training.points[attribute] + amount) * 2) / 2
      } else if (action === "upgrade") {
        if (!TRAINING_ATTRIBUTES.includes(attribute)) throw new TrainingError("Atributo inválido.")
        if (training.active) throw new TrainingError("Conclua o treinamento antes de evoluir.", 409)
        const currentGoal = trainingGoal(training, attribute)
        if (training.points[attribute] < currentGoal)
          throw new TrainingError("Pontos de treinamento insuficientes.", 409)
        const newDie = nextAttributeDie(current.attributes[attribute])
        if (!newDie) throw new TrainingError("O dado já atingiu seu limite (d20).", 409)
        const newAttributes = { ...current.attributes, [attribute]: newDie } as Character["attributes"]
        const oldMax = computeMaxResources(current.classes || [], current.attributes)
        const newMax = computeMaxResources(current.classes || [], newAttributes)
        next.attributes = newAttributes
        next.resources = {
          ...current.resources,
          maxHp: Math.max(0, current.resources.maxHp + newMax.maxHp - oldMax.maxHp),
          maxMp: Math.max(0, current.resources.maxMp + newMax.maxMp - oldMax.maxMp),
          maxIp: Math.max(0, current.resources.maxIp + newMax.maxIp - oldMax.maxIp),
        }
        const catalog = campaignItemCatalog(db, current.campaignId)
        next = normalizeResources(next, catalog) as TrainedCharacter
        training = spendTrainingUpgrade(training, attribute)!
      }
      next = withFatigue(next, training, now)
      db.characters.set(id, next)
      return { value: next, changed: true }
    }) as TrainedCharacter

    publish(updated.campaignId, { type: "character:updated", character: updated })
    return NextResponse.json({ success: true, character: updated, training: updated.training,
      serverNow: Date.now() }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return errorResponse(error) }
}
