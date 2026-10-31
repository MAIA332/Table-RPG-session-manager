import "server-only"
import { BESTIARY } from "./game-data"
import { deathDieSize, deathOutcome } from "./death-model"
import { randomInt, randomUUID } from "node:crypto"
import { store, transactStore, getMemberRole, publish } from "./store"
import {
  initialSpotlight,
  spotlightReducer,
  canAttack,
  validateCombat,
  rollDamage,
  DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS,
  MAX_SPECIAL_ATTACK_PREVIEW_SECONDS,
  validSpecialAttackPreviewUrl,
  type Attack,
  type Ability,
} from "./combat-model"
import { answerQte, createQte, expireQte, qteComplete } from "./qte-model"
import { resolveBestiaryAttack } from "./monster-attack-resolver"
import { isTrainingActive, trainingFatiguePenalty } from "./training-model"
import { isMonsterAttribute, type MonsterDiceState } from "./monster-dice"
import { PRESET_CHECKS } from "./combat-checks"
import {
  advanceCrisisProgress, resolveCrisisConditions, crisisBlocksRoll, crisisRollModifier, crisisSelfDamageOnRoll,
  normalizeCrisisConfig, parseCrisisConfig,
  type CrisisConfig, type CrisisPublicState, type CrisisAppliedCondition,
  type CrisisProgress, type ResolvedCrisisCondition,
} from "./crisis-model"
import { parseMonsterCustomCheck, resolveMonsterCustomDice, rollMonsterCustomDice } from "./monster-custom-check"
import { visibleMonsterCheckRolls } from "./monster-checks"
import { validateBestiaryCombat, validateBestiaryDice } from "./bestiary-attack-formula"
import {
  characterDefense,
  characterRoll,
  checkDefinition,
  affinityDamage,
  legacyAttacks,
  random,
} from "./combat-rules-server"
import type {
  CombatCommand,
  CombatSession,
  CombatSnapshot,
  CombatCreature,
  MonsterAttackPreview,
} from "./combat-types"
import type { Character, RealtimeEvent } from "./types"
type Database = Parameters<Parameters<typeof transactStore>[0]>[0]
type CrisisSession = CombatSession & {
  crisisConfig?: CrisisConfig
  crisisDue?: Record<string, number>
  crisisProgress?: Record<string, CrisisProgress>
  /** Último HP observado para identificar transições REAIS 1+ -> 0. */
  deathObservedHp?: Record<string, number>
}
const officialCheckIds = PRESET_CHECKS.map(check => check.id)
const crisisConfig = (session: CombatSession) => normalizeCrisisConfig((session as CrisisSession).crisisConfig, officialCheckIds)
type CrisisCharacter = Character & { crisisManual?: CrisisAppliedCondition[] }
type CrisisCreature = CombatCreature & { crisisManual?: CrisisAppliedCondition[] }
function entityProgress(s: CombatSession, kind: "player" | "creature", id: string) {
  const prefix = `${kind}:${id}:`
  return Object.fromEntries(Object.entries((s as CrisisSession).crisisProgress || {})
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => [key.slice(prefix.length), value]))
}
function crisisForCharacter(session: CombatSession, c: Character): ResolvedCrisisCondition[] {
  return resolveCrisisConditions(crisisConfig(session), c.resources.hp, c.resources.maxHp,
    (c as CrisisCharacter).crisisManual || [], entityProgress(session, "player", c.id))
}
function crisisForCreature(session: CombatSession, c: CombatCreature): ResolvedCrisisCondition[] {
  return session.enabled ? resolveCrisisConditions(crisisConfig(session), c.currentHp, c.maxHp,
    (c as CrisisCreature).crisisManual || [], entityProgress(session, "creature", c.instanceId)) : []
}

/** Avança efeitos tanto na ficha fora de combate quanto em combatentes vivos. */
/**
 * O DoT é resolvido em ciclos futuros, nunca cobrando períodos acumulados
 * durante suspensão/restart ou muitos GETs simultâneos.
 * A recuperação pelo teste de morte (1 HP) suspende danos periódicos até a
 * próxima cura efetiva (>1 HP) ou reinício explícito da condição pelo Mestre.
 */
function advanceCrisis(db: Database, campaignId: string, s: CombatSession, now = Date.now(), updatedCharacters = new Set<string>()): boolean {
  const state = s as CrisisSession
  const previous = state.crisisDue || {}
  const next: Record<string, number> = {}
  const oldProgress = state.crisisProgress || {}
  const workingProgress = { ...oldProgress }
  state.crisisProgress = workingProgress
  let changed = false
  const sources = [
    ...[...db.characters.values()].filter(c => c.campaignId === campaignId)
      .map(c => ({ kind: "player" as const, id: c.id, c })),
    ...(s.enabled ? s.creatures.map(c => ({ kind: "creature" as const, id: c.instanceId, c })) : []),
  ]
  for (const entry of sources) {
    const c = entry.c
    const getHp = () => entry.kind === "player"
      ? (db.characters.get(entry.id)?.resources.hp ?? 0)
      : (c as CombatCreature).currentHp
    const maxHp = entry.kind === "player" ? (c as Character).resources.maxHp : (c as CombatCreature).maxHp
    const prefix = `${entry.kind}:${entry.id}:`
    const conditions = () => entry.kind === "player"
      ? crisisForCharacter(s, db.characters.get(entry.id)!)
      : crisisForCreature(s, c as CombatCreature)
    const updateProgress = () => {
      const previousForEntity = entityProgress(s, entry.kind, entry.id)
      const updated = advanceCrisisProgress(crisisConfig(s), getHp(), maxHp, conditions(), previousForEntity)
      for (const key of Object.keys(workingProgress)) if (key.startsWith(prefix)) delete workingProgress[key]
      for (const [key, stage] of Object.entries(updated)) workingProgress[`${prefix}${key}`] = stage
    }
    updateProgress()
    const deathResult = entry.kind === "player" ? s.deathChecks?.[entry.id] : undefined
    const protectedRecovery = deathResult?.status === "recovered" && getHp() <= 1

    for (const condition of conditions()) {
      if (condition.kind !== "dot" || !condition.damage || !condition.intervalSeconds) continue
      if (protectedRecovery || getHp() <= 0) continue
      const key = `${prefix}${condition.applicationId}`
      const interval = Math.round(condition.intervalSeconds * 1000)
      if (!Number.isSafeInteger(interval) || interval < 1000) continue
      const due = previous[key]
      if (typeof due !== "number" || !Number.isFinite(due)) {
        next[key] = now + interval
        continue
      }
      if (due > now) {
        next[key] = due
        continue
      }
      // Atrasos de >= um intervalo são períodos perdidos, não dívida de HP.
      // O timer normal pode variar alguns milissegundos: isso não é atraso.
      if (now - due >= interval) {
        next[key] = now + interval
        continue
      }
      // No máximo um pulso por tick. Não aplica dano retroativo ao iniciar a aplicação.
      const damage = Math.min(getHp(), condition.damage)
      next[key] = now + interval
      if (!Number.isFinite(damage) || damage <= 0) continue
      const before = getHp()
      if (entry.kind === "player") {
        applyDamage(db, db.characters.get(entry.id)!, damage, s)
        if (getHp() !== before) updatedCharacters.add(entry.id)
      } else {
        const creature = c as CombatCreature
        creature.currentHp = Math.max(0, creature.currentHp - damage)
      }
      // A recuperação de morte pode elevar o HP para 1. Não repetir pulsos
      // para essa personagem neste mesmo avanço.
      addLog(s, `${c.name}: ${condition.name} causou ${damage} de dano.`, entry.kind === "player" ? entry.id : undefined, damage)
      changed = true
      if (entry.kind === "player" && s.deathChecks?.[entry.id]?.status === "recovered" && getHp() <= 1) break
    }
    updateProgress()
    const currentEffects = conditions()
    const activeKeys = new Set(currentEffects.map(effect => `${prefix}${effect.applicationId}`))
    for (const key of Object.keys(next)) {
      if (key.startsWith(prefix) && !activeKeys.has(key)) delete next[key]
    }
    // Não alimentar timers para personagens em 0 HP ou recém recuperados.
    const hold = getHp() <= 0 || (entry.kind === "player" &&
      s.deathChecks?.[entry.id]?.status === "recovered" && getHp() <= 1)
    if (hold) {
      for (const key of Object.keys(next)) if (key.startsWith(prefix)) delete next[key]
      continue
    }
    for (const effect of currentEffects) {
      if (effect.kind !== "dot" || !effect.intervalSeconds) continue
      const interval = Math.round(effect.intervalSeconds * 1000)
      if (!Number.isSafeInteger(interval) || interval < 1000) continue
      const key = `${prefix}${effect.applicationId}`
      if (!next[key]) next[key] = now + interval
    }
  }
  if (JSON.stringify(previous) !== JSON.stringify(next)) changed = true
  if (JSON.stringify(oldProgress) !== JSON.stringify(workingProgress)) changed = true
  state.crisisDue = next
  return changed
}

function crisisPublicState(db: Database, campaignId: string, s: CombatSession): CrisisPublicState {
  const config = crisisConfig(s)
  const clocks = (s as CrisisSession).crisisDue || {}
  const status = (conditions: ResolvedCrisisCondition[], key: string, manual: CrisisAppliedCondition[] = []) => ({
    crisis: conditions.length > 0,
    manualApplied: manual.map(effect => ({
      applicationId: `manual:${effect.id}`, name: effect.definition.name, description: effect.definition.description,
    })),
    conditions: conditions.map(condition => ({
      ...condition,
      ...(clocks[`${key}:${condition.applicationId}`] ? { nextTickAt: clocks[`${key}:${condition.applicationId}`] } : {}),
    })),
  })
  const players = [...db.characters.values()].filter(c => c.campaignId === campaignId)
  const creatures = s.enabled ? s.creatures : []
  return {
    enabled: config.enabled || players.some(c => !!(c as CrisisCharacter).crisisManual?.length) ||
      creatures.some(c => !!(c as CrisisCreature).crisisManual?.length),
    thresholdPercent: config.thresholdPercent,
    players: Object.fromEntries(players.map(c => [c.id, status(crisisForCharacter(s, c), `player:${c.id}`,
      (c as CrisisCharacter).crisisManual || [])])),
    creatures: Object.fromEntries(creatures.map(c =>
      [c.instanceId, status(crisisForCreature(s, c), `creature:${c.instanceId}`,
        (c as CrisisCreature).crisisManual || [])])),
  }
}

/** Evita aplicar a condição Cansado duas vezes, mesmo se o resolvedor lê customModifiers. */
function characterRollWithFatigue(...args: Parameters<typeof characterRoll>): ReturnType<typeof characterRoll> {
  const original = args[0] as Character
  const existingModifiers = (original as Character & { customModifiers?: unknown }).customModifiers
  const filtered = {
    ...original,
    customModifiers: (Array.isArray(existingModifiers) ? existingModifiers : [])
      .filter((mod: any) => mod?.type !== "training_fatigue"),
  } as Character
  const result = characterRoll(...([filtered, ...args.slice(1)] as Parameters<typeof characterRoll>))
  const penalty = (args[1] as readonly string[]).includes("dex")
    ? trainingFatiguePenalty((original as any).training) : 0
  return penalty ? { ...result, total: result.total - penalty, modifier: result.modifier - penalty } : result
}
function characterRollWithCrisis(
  db: Database, session: CombatSession, ...args: Parameters<typeof characterRoll>
): ReturnType<typeof characterRoll> {
  const c = args[0]
  const conditions = crisisForCharacter(session, c)
  requireTrue(!crisisBlocksRoll(conditions), `${c.name} está com Paralisia e não pode rolar dados.`, 409)
  const rolled = characterRollWithFatigue(...args)
  const bonus = crisisRollModifier(conditions, args[1], args[5])
  const selfDamage = crisisSelfDamageOnRoll(conditions)
  if (selfDamage) {
    applyDamage(db, c, selfDamage, session)
    addLog(session, `${c.name} sofreu ${selfDamage} de dano ao rolar sob Atordoamento.`, c.id, selfDamage)
  }
  return { ...rolled, total: rolled.total + bonus, modifier: rolled.modifier + bonus }
}
export class CombatError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}
function requireTrue(
  value: unknown,
  message: string,
  status = 400,
): asserts value {
  if (!value) throw new CombatError(message, status)
}
function text(value: unknown, name: string, max = 200): string {
  requireTrue(
    typeof value === "string" && value.length > 0 && value.length <= max,
    `${name} inválido`,
  )
  return value
}
function integer(value: unknown, name: string, min = 0, max = 100000): number {
  requireTrue(
    typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max,
    `${name} inválido`,
  )
  return value
}
function newSession(): CombatSession {
  return {
    revision: 0,
    updatedAt: 0,
    enabled: false,
    spotlight: initialSpotlight([]),
    actorCharacterId: null,
    participantCharacterIds: [],
    creatures: [],
    playerAttacks: {},
    qte: null,
    pendingAttack: null,
    attackPreviews: [],
    deathChecks: {},
    log: [],
    receipts: [],
  }
}
function authorize(db: Database, campaignId: string, userId: string) {
  const campaign = db.campaigns.get(campaignId)
  requireTrue(campaign, "Campanha não encontrada", 404)
  const role = getMemberRole(campaign, userId)
  requireTrue(role, "Sem acesso à campanha", 403)
  return { campaign, role }
}
function character(db: Database, campaignId: string, id: string) {
  const value = db.characters.get(id)
  requireTrue(
    value && value.campaignId === campaignId,
    "Personagem não encontrado nesta campanha",
    404,
  )
  return value
}
function addLog(
  s: CombatSession,
  message: string,
  characterId?: string,
  damage?: number,
) {
  s.log = [
    { id: randomUUID(), at: Date.now(), text: message, characterId, damage },
    ...s.log,
  ].slice(0, 60)
}
function applyDamage(db: Database, c: Character, damage: number, s: CombatSession) {
  if (!Number.isFinite(damage) || damage <= 0) return
  const current = db.characters.get(c.id) || c
  const before = current.resources.hp
  if (!Number.isFinite(before) || before <= 0) return
  const hp = Math.max(0, Math.min(current.resources.maxHp, before - damage))
  if (hp === before) return
  db.characters.set(c.id, {
    ...current,
    resources: { ...current.resources, hp },
    updatedAt: Math.max(Date.now(), Number(current.updatedAt || 0) + 1),
  })
  reconcileDeath(db, db.characters.get(c.id)!, s)
  // O estado observado armazena o HP final, inclusive recuperação para 1.
  const observed = ((s as CrisisSession).deathObservedHp ??= {})
  observed[c.id] = db.characters.get(c.id)?.resources.hp ?? hp
}
function reconcileDeath(db: Database, c: Character, s: CombatSession): boolean {
  const checks = s.deathChecks ??= {}
  const previous = checks[c.id]
  if (c.resources.hp > 0) {
    if (previous?.active) { previous.active = false; return true }
    return false
  }
  // Um óbito vigente não pode ser reprocessado em leituras subsequentes.
  if (previous?.active) return false
  const die = String(c.attributes.mig)
  const size = deathDieSize(die)
  const rolls = Array.from({ length: 3 }, () => randomInt(1, size + 1))
  const total = rolls.reduce((sum, n) => sum + n, 0)
  const result = deathOutcome(total)
  const check = {
    id: randomUUID(), at: Date.now(), characterId: c.id, characterName: c.name,
    die, rolls, total, status: result.status, label: result.label, effect: result.effect,
    active: result.status !== "recovered",
  }
  checks[c.id] = check
  if (result.status === "recovered") {
    db.characters.set(c.id, { ...c, resources: { ...c.resources, hp: 1 },
      updatedAt: Math.max(Date.now(), Number(c.updatedAt || 0) + 1) })
  }
  s.log = [{
    id: check.id, at: check.at, characterId: c.id,
    text: `${c.name} chegou a 0 HP. Vigor: ${rolls.join(" + ")} = ${total}. ${result.label}. ${result.effect}`,
    roll: {
      type: "dice:roll" as const, characterId: c.id, characterName: c.name,
      playerName: db.users.get(c.ownerId)?.name || "Jogador",
      attribute: `Morte · Vigor [${die} + ${die} + ${die}] · ${result.label} · ${result.effect}`,
      result: total, breakdown: rolls.join(" + "), modifier: 0,
    },
  }, ...s.log].slice(0, 60)
  return true
}
function reconcileCampaignDeaths(db: Database, campaignId: string, s: CombatSession, userId: string) {
  // GET/sincronização deve OBSERVAR o estado; nunca gerar morte só porque
  // um personagem já estava a 0 HP quando a aplicação foi iniciada.
  const { role } = authorize(db, campaignId, userId)
  const state = s as CrisisSession
  const observed = state.deathObservedHp ?? {}
  const next = { ...observed }
  let changed = false
  for (const c of db.characters.values()) {
    if (c.campaignId !== campaignId || (role !== "gm" && c.ownerId !== userId)) continue
    const hp = c.resources.hp
    const last = observed[c.id]
    // Sem linha de base na sessão: apenas registra o valor atual, sem rolagem.
    if (typeof last === "number" && last > 0 && hp <= 0) {
      if (reconcileDeath(db, c, s)) changed = true
    } else if (hp > 0 && s.deathChecks?.[c.id]?.active) {
      if (reconcileDeath(db, c, s)) changed = true
    }
    const finalHp = db.characters.get(c.id)?.resources.hp ?? hp
    if (next[c.id] !== finalHp) { next[c.id] = finalHp; changed = true }
  }
  if (changed) state.deathObservedHp = next
  return changed
}

function finishQte(
  db: Database,
  campaignId: string,
  s: CombatSession,
  next: NonNullable<CombatSession["qte"]>,
) {
  const previous = s.qte
  for (const [id, result] of Object.entries(next.outcomes)) {
    if (previous?.outcomes[id]) continue
    const c = db.characters.get(id)
    if (!c || c.campaignId !== campaignId) continue
    applyDamage(db, c, result.damage, s)
    addLog(
      s,
      `${c.name}: ${result.total === null ? "tempo esgotado" : result.success ? "sucesso" : "falha"} em ${next.ability.name}. ${result.damage} de dano. ${result.effect}`,
      id,
      result.damage,
    )
  }
  s.qte = next
  if (qteComplete(next)) {
    s.spotlight = spotlightReducer(s.spotlight, { type: "gm-pass" })
    s.actorCharacterId = null
  }
}
function expire(db: Database, campaignId: string, s: CombatSession) {
  if (!s.qte || qteComplete(s.qte) || Date.now() < s.qte.deadline) return false
  finishQte(db, campaignId, s, expireQte(s.qte, Date.now(), random))
  return true
}
function roster(db: Database, campaignId: string, s: CombatSession) {
  const campaign = db.campaigns.get(campaignId)!
  const ids = s.participantCharacterIds.filter((id) => {
    const c = db.characters.get(id)
    if (
      !c ||
      c.campaignId !== campaignId ||
      !getMemberRole(campaign, c.ownerId)
    )
      return false
    return true
  })
  const players = [
    ...new Map(
      ids.map((id) => {
        const c = db.characters.get(id)!
        return [
          c.ownerId,
          { id: c.ownerId, name: c.name, avatar: (c as any).avatarUrl },
        ] as const
      }),
    ).values(),
  ]
  const approverIds = [
    ...new Set([
      campaign.ownerId,
      ...campaign.members.filter((m) => m.role === "gm").map((m) => m.userId),
    ]),
  ]
  const changed =
    JSON.stringify(ids) !== JSON.stringify(s.participantCharacterIds) ||
    JSON.stringify(approverIds) !== JSON.stringify(s.spotlight.approverIds) ||
    JSON.stringify(players) !== JSON.stringify(s.spotlight.players)
  if (changed) {
    s.participantCharacterIds = ids
    s.spotlight = spotlightReducer(s.spotlight, {
      type: "gm-roster",
      players,
      approverIds,
    })
    s.actorCharacterId = null
  }
  return changed
}
function snapshot(
  db: Database,
  campaignId: string,
  s: CombatSession,
  userId: string,
): CombatSnapshot {
  const { role } = authorize(db, campaignId, userId)
  const gm = role === "gm"
  const { receipts, monsterAttributeRolls, monsterCheckRolls, attackPreviews,
    crisisConfig: privateCrisisConfig, crisisDue, crisisProgress, deathObservedHp, ...publicState } = s as CrisisSession & MonsterDiceState
  const characters = [...db.characters.values()]
    .filter((c) => c.campaignId === campaignId)
    .map((c) => ({
      id: c.id,
      name: c.name,
      ownerId: c.ownerId,
      avatarUrl: (c as any).avatarUrl,
      resources: {
        hp: c.resources.hp,
        maxHp: c.resources.maxHp,
        mp: c.resources.mp,
        maxMp: c.resources.maxMp,
      },
      updatedAt: c.updatedAt,
    }))
  return {
    ...publicState,
    // Nunca enviar URLs de golpes de outros jogadores no snapshot da campanha.
    attackPreviews: (attackPreviews || []).filter(preview =>
      preview.expiresAt > Date.now() &&
      (gm || db.characters.get(preview.characterId)?.ownerId === userId)),
    ...{ crisis: crisisPublicState(db, campaignId, s), ...(gm ? { crisisConfig: crisisConfig(s) } : {}) },
    ...{
      // Nunca transmite as rolagens privadas via JSON para os jogadores.
      monsterAttributeRolls: gm
        ? (monsterAttributeRolls || [])
        : (monsterAttributeRolls || []).filter(entry => entry.shared),
      // Não exponha testes privados por meio do spread de publicState.
      monsterCheckRolls: visibleMonsterCheckRolls(monsterCheckRolls || [], gm),
      shareMonsterRolls: publicState.shareMonsterRolls === true,
    },
    spotlight: {
      ...s.spotlight,
      tokens: gm ? s.spotlight.tokens : 0,
      players: s.spotlight.players.map((p) => {
        const actor = s.actorCharacterId
          ? db.characters.get(s.actorCharacterId)
          : undefined
        return actor?.ownerId === p.id
          ? { ...p, name: actor.name, avatar: actor.avatarUrl }
          : p
      }),
    },
    creatures: gm
      ? s.creatures
      : s.creatures.map((c) => ({
          id: c.id,
          instanceId: c.instanceId,
          name: c.name,
          imageUrl: c.imageUrl,
          species: c.species,
          level: c.level,
          maxHp: 100,
          currentHp:
            c.maxHp > 0 ? (Math.max(0, c.currentHp) / c.maxHp) * 100 : 0,
          maxMp: 100,
          currentMp:
            c.maxMp > 0 ? (Math.max(0, c.currentMp) / c.maxMp) * 100 : 0,
          def: 0,
          mdef: 0,
          attributes: { dex: "?", ins: "?", mig: "?", wlp: "?" },
          equipment: [],
          basicAttacks: [],
          spells: [],
          affinities: {},
        })),
    playerAttacks: gm
      ? s.playerAttacks
      : Object.fromEntries(
          Object.entries(s.playerAttacks).filter(
            ([id]) => db.characters.get(id)?.ownerId === userId,
          ),
        ),
    // Uma rolagem marcada como privada quando foi executada jamais entra
    // no payload do jogador, ainda que a configuração seja alterada depois.
    ...{
      pendingAttack: !gm && s.pendingAttack &&
        (s.pendingAttack as typeof s.pendingAttack & { monsterRollShared?: boolean }).monsterRollShared === false
        ? { ...s.pendingAttack, total: 0, rolls: [], dice: [], damage: 0, effect: "" }
        : s.pendingAttack,
      log: gm ? s.log : s.log.map(entry => {
        const visibility = entry as typeof entry & { monsterRollShared?: boolean }
        if (visibility.monsterRollShared !== false) return entry
        if (entry.id.endsWith(":hit")) {
          return { ...entry, roll: undefined,
            text: entry.text.replace(/: acerto \d+,/, ": rolagem oculta,") }
        }
        if (entry.id.endsWith(":reflex")) {
          return { ...entry,
            text: entry.text.replace(/contra \d+/, "contra dificuldade oculta"),
            roll: entry.roll ? { ...entry.roll,
              attribute: entry.roll.attribute.replace(/Reflexos contra \d+/, "Reflexos contra dificuldade oculta") } : undefined,
          }
        }
        return { ...entry, roll: undefined }
      }),
    },
    characters,
    serverNow: Date.now(),
    viewerRole: role,
  }
}
function saveRevision(db: Database, campaignId: string, s: CombatSession) {
  s.revision++
  s.updatedAt = Date.now()
  db.combatSessions.set(campaignId, s)
}
function signal(campaignId: string, revision: number) {
  publish(campaignId, {
    type: "combat:invalidate",
    revision,
  } as unknown as RealtimeEvent)
}
function signalCrisisCharacters(campaignId: string, ids: Set<string>) {
  for (const id of ids) {
    const character = store.characters.get(id)
    if (character?.campaignId === campaignId) publish(campaignId, { type: "character:updated", character })
  }
}
const timersGlobal = globalThis as unknown as {
  __combatTimers?: Map<string, ReturnType<typeof setTimeout>>
}
const timers = (timersGlobal.__combatTimers ??= new Map())
function schedule(campaignId: string, s: CombatSession) {
  const existing = timers.get(campaignId)
  if (existing) clearTimeout(existing)
  timers.delete(campaignId)
  const qteDeadline = s.qte && !qteComplete(s.qte) ? s.qte.deadline : Infinity
  const dotDeadlines = Object.values((s as CrisisSession).crisisDue || {})
  const deadline = Math.min(qteDeadline, ...dotDeadlines)
  if (!Number.isFinite(deadline)) return
  const timer = setTimeout(
    async () => {
      timers.delete(campaignId)
      try {
        const updatedIds = new Set<string>()
        const result = await transactStore((db) => {
          const current = db.combatSessions.get(campaignId)
          if (!current || !db.campaigns.has(campaignId))
            return { value: null, changed: false }
          const qteChanged = expire(db, campaignId, current)
          const crisisChanged = advanceCrisis(db, campaignId, current, Date.now(), updatedIds)
          const changed = qteChanged || crisisChanged
          if (changed) saveRevision(db, campaignId, current)
          return { value: { session: current, changed }, changed }
        })
        if (result) {
          if (result.changed) signal(campaignId, result.session.revision)
          signalCrisisCharacters(campaignId, updatedIds)
          schedule(campaignId, result.session)
        }
      } catch (error) {
        console.error("[combat] Não foi possível resolver o prazo", error)
        const retry = setTimeout(() => {
          const current = store.combatSessions.get(campaignId)
          if (current) schedule(campaignId, current)
        }, 1000)
        retry.unref?.()
      }
    },
    Math.max(1, deadline - Date.now()),
  )
  timer.unref?.()
  timers.set(campaignId, timer)
}
export async function getCombat(campaignId: string, userId: string): Promise<CombatSnapshot> {
  const updatedIds = new Set<string>()
  const result = await transactStore((db) => {
    authorize(db, campaignId, userId)
    const s = db.combatSessions.get(campaignId) || newSession()
    const expired = expire(db, campaignId, s)
    const deathChanged = reconcileCampaignDeaths(db, campaignId, s, userId)
    const rosterChanged = roster(db, campaignId, s)
    const crisisChanged = advanceCrisis(db, campaignId, s, Date.now(), updatedIds)
    const changed = rosterChanged || expired || deathChanged || crisisChanged
    if (changed) saveRevision(db, campaignId, s)
    return {
      value: { view: snapshot(db, campaignId, s, userId), session: s, changed },
      changed,
    }
  })
  if (result.changed) signal(campaignId, result.session.revision)
  signalCrisisCharacters(campaignId, updatedIds)
  schedule(campaignId, result.session)
  return result.view
}
function validateAttack(value: unknown, origin: "player" | "creature" = "player"): Attack {
  requireTrue(value && typeof value === "object", "Ataque inválido")
  const a = value as Attack
  text(a.name, "Nome do ataque")
  text(a.damage, "Dano", 40)
  text(a.type, "Tipo de dano", 40)
  requireTrue(Array.isArray(a.attributes), "Atributos inválidos")
  requireTrue(
    a.targetDefense === "physical" || a.targetDefense === "magical",
    "Defesa alvo inválida",
  )
  // O limite ampliado pertence EXCLUSIVAMENTE ao Bestiário. Os ataques
  // distribuídos aos personagens continuam com os dois atributos tradicionais.
  const error = origin === "creature"
    ? validateBestiaryCombat([a], [])
    : validateCombat([a], [])
  requireTrue(!error, error || "")
  if (a.description !== undefined)
    requireTrue(
      typeof a.description === "string" && a.description.length <= 2000,
      "Efeito muito longo",
    )
  if (a.previewImageUrl !== undefined && a.previewImageUrl !== "") {
    requireTrue(origin === "creature", "Imagem de golpe exclusiva de criaturas e oponentes.")
    requireTrue(validSpecialAttackPreviewUrl(a.previewImageUrl),
      "Imagem do golpe inválida. Use URL HTTPS ou imagem PNG/JPEG/WebP/GIF/AVIF compacta.")
  }
  if (a.previewDurationSeconds !== undefined) {
    requireTrue(origin === "creature", "Duração de imagem exclusiva de criaturas e oponentes.")
    requireTrue(Number.isSafeInteger(a.previewDurationSeconds) &&
      a.previewDurationSeconds >= 1 &&
      a.previewDurationSeconds <= MAX_SPECIAL_ATTACK_PREVIEW_SECONDS,
      "Duração da imagem inválida (1 a 86400 segundos).")
  }
  return structuredClone(a)
}
function validateCreature(value: unknown): CombatCreature {
  requireTrue(
    value && typeof value === "object" && !Array.isArray(value),
    "Criatura inválida",
  )
  const c = structuredClone(value) as CombatCreature
  text(c.id, "ID")
  text(c.instanceId, "Instância")
  text(c.name, "Nome")
  text(c.species, "Espécie")
  integer(c.maxHp, "HP máximo", 1)
  integer(c.maxMp, "MP máximo")
  integer(c.def, "Defesa")
  integer(c.mdef, "Defesa mágica")
  integer(c.level, "Nível", 0, 1000)
  requireTrue(
    c.attributes &&
      ["dex", "ins", "mig", "wlp"].every((a) =>
        /^d(4|6|8|10|12|20)$/.test(
          c.attributes[a as keyof typeof c.attributes],
        ),
      ),
    "Dados da criatura inválidos",
  )
  const diceError = validateBestiaryDice(c.attributes)
  requireTrue(!diceError, diceError || "Dados inválidos")
  c.currentHp = integer(c.currentHp ?? c.maxHp, "HP", 0, c.maxHp)
  c.currentMp = integer(c.currentMp ?? c.maxMp, "MP", 0, c.maxMp)
  // Preferir a fórmula V2 original, sem conversão pelo formato legado que
  // poderia reduzir um golpe de 10 dados aos dois primeiros atributos.
  const creatureAttacks = Array.isArray(c.basicAttacksV2) && c.basicAttacksV2.length
    ? c.basicAttacksV2
    : legacyAttacks(c)
  c.basicAttacksV2 = creatureAttacks.map(attack => validateAttack(attack, "creature"))
  requireTrue(c.basicAttacksV2.length <= 30, "Máximo de 30 ataques")
  if (c.abilities !== undefined) {
    requireTrue(
      Array.isArray(c.abilities) && c.abilities.length <= 30,
      "Habilidades inválidas",
    )
    const ids = new Set<string>()
    for (const a of c.abilities) {
      text(a.id, "ID da habilidade")
      requireTrue(!ids.has(a.id), "ID de habilidade repetido")
      ids.add(a.id)
      text(a.name, "Nome da habilidade")
      requireTrue(
        ["attack", "passive", "qte"].includes(a.kind),
        "Tipo de habilidade inválido",
      )
      if (a.kind !== "passive") {
        requireTrue(
          a.cost && ["mp", "token"].includes(a.cost.resource),
          "Recurso inválido",
        )
        integer(a.cost.amount, "Custo")
      }
      if (a.kind === "attack") validateAttack(a.attack, "creature")
      if (a.kind === "qte") checkDefinition(a.checkId)
    }
    const error = validateBestiaryCombat(
      c.basicAttacksV2.length
        ? c.basicAttacksV2
        : [
            {
              name: "Validação",
              attributes: ["mig", "mig"],
              targetDefense: "physical",
              damage: "0",
              type: "físico",
            },
          ],
      c.abilities,
    )
    requireTrue(!error, error || "")
  }
  return c
}
function spend(
  s: CombatSession,
  c: CombatCreature,
  cost: { amount: number; resource: "mp" | "token" },
) {
  integer(cost.amount, "Custo")
  if (cost.resource === "token") {
    requireTrue(s.spotlight.tokens >= cost.amount, "Tokens insuficientes")
    s.spotlight = { ...s.spotlight, tokens: s.spotlight.tokens - cost.amount }
  } else {
    requireTrue(c.currentMp >= cost.amount, "Mana insuficiente")
    c.currentMp -= cost.amount
  }
}
export async function commandCombat(
  campaignId: string,
  userId: string,
  input: unknown,
): Promise<CombatSnapshot> {
  requireTrue(
    input && typeof input === "object" && !Array.isArray(input),
    "Comando inválido",
  )
  const command = input as CombatCommand
  const commandId = text(command.commandId, "ID do comando", 100)
  text(command.type, "Tipo", 40)
  const updatedIds = new Set<string>()
  const result = await transactStore((db) => {
    const { campaign, role } = authorize(db, campaignId, userId)
    const gm = role === "gm",
      s = db.combatSessions.get(campaignId) || newSession()
    const receipt = `${userId}:${commandId}`
    if (s.receipts.includes(receipt))
      return {
        value: {
          view: snapshot(db, campaignId, s, userId),
          session: s,
          changed: false,
        },
        changed: false,
      }
    // Persist expired QTEs before resolving a later command. A late reply cannot change an outcome.
    expire(db, campaignId, s)
    roster(db, campaignId, s)
    for (const c of db.characters.values()) {
      if (c.campaignId === campaignId && c.resources.hp > 0 && s.deathChecks?.[c.id]?.active)
        s.deathChecks[c.id].active = false
    }
    const scoped = ["approve", "cancel", "react", "answer-attack", "crisis-sheet-roll", "cancel-attack-preview"].includes(command.type)
    if (!scoped)
      requireTrue(
        integer(command.expectedRevision, "Revisão") === s.revision,
        "O combate mudou. Atualize a ação e tente novamente.",
        409,
      )
    const gmOnly = [
      "save-creature-abilities",
      "start",
      "end",
      "roster",
      "gm-pass",
      "gm-steal",
      "gm-round",
      "gm-spend",
      "spawn",
      "update-creature",
      "remove-creature",
      "set-attacks",
      "monster-attack",
      "cancel-attack-preview",
      "monster-attribute-roll",
      "monster-check-roll",
      "monster-custom-check-roll",
      "gm-npc-roll",
      "set-monster-roll-visibility",
      "set-crisis-enabled",
      "set-crisis-config",
      "apply-crisis-effect",
      "remove-crisis-effect",
      "start-qte",
      "close-qte",
    ]
    if (gmOnly.includes(command.type))
      requireTrue(gm, "Ação exclusiva do Mestre", 403)
    const getCreature = () => {
      const c = s.creatures.find(
        (c) => c.instanceId === text(command.instanceId, "Criatura"),
      )
      requireTrue(c, "Criatura não encontrada", 404)
      return c
    }
    const aliveCharacter = (id: string) => {
      const c = character(db, campaignId, id)
      requireTrue(c.resources.hp > 0, "Personagem sem HP para agir")
      return c
    }
    if (
      s.qte &&
      !qteComplete(s.qte) &&
      ["request", "gm-pass", "gm-steal"].includes(command.type)
    ) {
      throw new CombatError("Aguarde o QTE terminar antes de trocar o Holofote")
    }
    if (s.pendingAttack && !["answer-attack", "end", "monster-attribute-roll", "monster-check-roll", "monster-custom-check-roll", "gm-npc-roll", "crisis-sheet-roll", "set-monster-roll-visibility", "set-crisis-enabled", "set-crisis-config", "apply-crisis-effect", "remove-crisis-effect", "cancel-attack-preview"].includes(command.type)) {
      throw new CombatError("Aguarde o jogador resolver o ataque pendente", 409)
    }
    switch (command.type) {
      case "cancel-attack-preview": {
        const previewId = text(command.previewId, "Visualização do golpe", 120)
        const previews = s.attackPreviews || []
        requireTrue(previews.some(preview => preview.id === previewId),
          "Imagem não encontrada ou já encerrada.", 404)
        s.attackPreviews = previews.filter(preview => preview.id !== previewId)
        break
      }
      case "crisis-sheet-roll": {
        const c = character(db, campaignId, text(command.characterId, "Personagem"))
        if (s.enabled) requireTrue(s.participantCharacterIds.includes(c.id), "Personagem fora do combate", 403)
        requireTrue(c.ownerId === userId || (gm && getMemberRole(campaign, c.ownerId) === "gm"), "Você não controla esta ficha", 403)
        const conditions = crisisForCharacter(s, c)
        requireTrue(!crisisBlocksRoll(conditions), `${c.name} está com Paralisia.`, 409)
        if (crisisSelfDamageOnRoll(conditions)) {
          applyDamage(db, c, 1, s)
          addLog(s, `${c.name} sofreu 1 de dano ao rolar sob Atordoamento.`, c.id, 1)
        }
        break
      }
      case "set-crisis-enabled": {
        requireTrue(typeof command.enabled === "boolean", "Estado do desgaste inválido")
        ;(s as CrisisSession).crisisConfig = { ...crisisConfig(s), enabled: command.enabled }
        // Efeitos manuais não são desligados nem reiniciados pelo switch geral.
        addLog(s, `Desgaste automático ${command.enabled ? "ativado" : "desativado"} pelo Mestre.`)
        break
      }
      case "set-crisis-config": {
        let config: CrisisConfig
        try { config = parseCrisisConfig(command.config, officialCheckIds) }
        catch (error) { throw new CombatError(error instanceof Error ? error.message : "Configuração inválida") }
        ;(s as CrisisSession).crisisConfig = config
        ;(s as CrisisSession).crisisDue = {} // Intervalos reiniciam ao editar a regra.
        ;(s as CrisisSession).crisisProgress = {}
        addLog(s, "Condições de desgaste atualizadas pelo Mestre.")
        break
      }
      case "apply-crisis-effect":
      case "remove-crisis-effect": {
        const subjectType = command.subjectType
        requireTrue(subjectType === "character" || subjectType === "creature", "Tipo de alvo inválido")
        const subjectId = text(command.subjectId, "Alvo", 150)
        const subject = subjectType === "character"
          ? character(db, campaignId, subjectId) as CrisisCharacter
          : s.creatures.find(c => c.instanceId === subjectId) as CrisisCreature | undefined
        requireTrue(subject, "Alvo não encontrado", 404)
        if (subjectType === "creature") requireTrue(s.enabled, "Criaturas recebem efeitos somente em combate", 409)
        const currentManual = Array.isArray(subject.crisisManual) ? subject.crisisManual : []
        if (command.type === "apply-crisis-effect") {
          const conditionId = text(command.conditionId, "Condição", 70)
          const definition = crisisConfig(s).conditions.find(c => c.id === conditionId)
          requireTrue(definition, "Condição não cadastrada", 404)
          requireTrue(currentManual.length < 30, "Limite de 30 efeitos manuais por alvo", 409)
          requireTrue(!currentManual.some(item => item.definition.id === definition.id),
            "Essa condição já foi aplicada manualmente ao alvo.", 409)
          subject.crisisManual = [...currentManual, {
            id: randomUUID(), definition: structuredClone(definition), appliedAt: Date.now(),
          }]
          addLog(s, `Mestre aplicou ${definition.name} em ${subject.name}.`,
            subjectType === "character" ? subjectId : undefined)
        } else {
          const applicationId = text(command.applicationId, "Efeito aplicado", 140)
          const index = currentManual.findIndex(item => `manual:${item.id}` === applicationId)
          requireTrue(index >= 0, "Efeito manual não encontrado no alvo", 404)
          const conditionName = currentManual[index].definition.name
          subject.crisisManual = currentManual.filter((_, i) => i !== index)
          addLog(s, `Mestre removeu ${conditionName} de ${subject.name}.`,
            subjectType === "character" ? subjectId : undefined)
        }
        if (subjectType === "character") {
          const c = subject as CrisisCharacter
          db.characters.set(subjectId, { ...c, updatedAt: Math.max(Date.now(), Number(c.updatedAt || 0) + 1) })
          updatedIds.add(subjectId)
        }
        break
      }
      case "set-monster-roll-visibility": {
        requireTrue(typeof command.enabled === "boolean", "Visibilidade inválida")
        ;(s as CombatSession & MonsterDiceState).shareMonsterRolls = command.enabled
        break
      }
      case "monster-attribute-roll": {
        // Não requer Holofote, mas somente GM pode rolar e escolher o atributo.
        const creature = getCreature()
        const conditions = crisisForCreature(s, creature)
        requireTrue(!crisisBlocksRoll(conditions), `${creature.name} está com Paralisia.`, 409)
        requireTrue(isMonsterAttribute(command.attribute), "Atributo de criatura inválido")
        const attribute = command.attribute
        const die = String(creature.attributes[attribute])
        requireTrue(/^d(4|6|8|10|12|20)$/.test(die), "Dado da criatura inválido")
        const size = Number(die.slice(1))
        const state = s as CombatSession & MonsterDiceState
        state.monsterAttributeRolls = [
          ...((state.monsterAttributeRolls || []).slice(-39)),
          { id: randomUUID(), instanceId: creature.instanceId,
            creatureName: creature.name, attribute, die,
            result: randomInt(1, size + 1) + crisisRollModifier(conditions, [attribute]), at: Date.now(),
            shared: state.shareMonsterRolls === true },
        ]
        if (crisisSelfDamageOnRoll(conditions)) {
          creature.currentHp = Math.max(0, creature.currentHp - 1)
          addLog(s, `${creature.name} sofreu 1 de dano ao rolar sob Atordoamento.`, undefined, 1)
        }
        // NÃO usar addLog/publish(dice:roll): ambas as vias são públicas.
        break
      }
      case "monster-check-roll": {
        // Testes iguais aos tradicionais do jogador: definição e dados são
        // obtidos do catálogo do servidor; o cliente envia apenas o ID.
        const creature = getCreature()
        const conditions = crisisForCreature(s, creature)
        requireTrue(!crisisBlocksRoll(conditions), `${creature.name} está com Paralisia.`, 409)
        const checkId = text(command.checkId, "Teste", 100)
        const check = PRESET_CHECKS.find(entry => entry.id === checkId)
        requireTrue(check, "Teste de perícia não encontrado", 404)
        requireTrue(check.attrs.length > 0 && check.attrs.length <= 10,
          "Quantidade de dados inválida")
        const dice = check.attrs.map(attribute => {
          requireTrue(isMonsterAttribute(attribute), "Atributo do teste inválido")
          const die = String(creature.attributes[attribute as keyof CombatCreature["attributes"]])
          requireTrue(/^d(4|6|8|10|12|20)$/.test(die), "Dado da criatura inválido")
          return die
        })
        const rolls = dice.map(die => randomInt(1, Number(die.slice(1)) + 1))
        s.monsterCheckRolls = [
          ...(s.monsterCheckRolls || []).slice(-39),
          {
            id: randomUUID(), instanceId: creature.instanceId,
            creatureName: creature.name, checkId: check.id, checkName: check.name,
            dice, rolls, result: rolls.reduce((total, face) => total + face, 0) + crisisRollModifier(conditions, check.attrs, check.id),
            at: Date.now(),
            // A decisão é registrada no instante do lançamento.
            // Trocar a preferência depois não expõe dados antigos.
            shared: (s as CombatSession & MonsterDiceState).shareMonsterRolls === true,
          },
        ]
        if (crisisSelfDamageOnRoll(conditions)) {
          creature.currentHp = Math.max(0, creature.currentHp - 1)
          addLog(s, `${creature.name} sofreu 1 de dano ao rolar sob Atordoamento.`, undefined, 1)
        }
        // NÃO usar addLog nem publicar dice:roll: ambos chegam a espectadores.
        break
      }
      case "monster-custom-check-roll": {
        // Só o Mestre pode escolher um teste personalizado. A definição
        // enviada é validada integralmente, inclusive tipo, atributos e
        // quantidade (1..10) de dados; as faces são geradas pelo servidor.
        const creature = getCreature()
        const conditions = crisisForCreature(s, creature)
        requireTrue(!crisisBlocksRoll(conditions), `${creature.name} está com Paralisia.`, 409)
        let check: ReturnType<typeof parseMonsterCustomCheck>
        let dice: string[]
        let rolled: ReturnType<typeof rollMonsterCustomDice>
        try {
          check = parseMonsterCustomCheck(command.customCheck)
          dice = resolveMonsterCustomDice(check, creature.attributes)
          rolled = rollMonsterCustomDice(dice, sides => randomInt(1, sides + 1))
        } catch (error) {
          throw new CombatError(error instanceof Error ? error.message : "Teste personalizado inválido")
        }
        // Testes personalizados não recebem bônus direcionados a IDs de testes
        // oficiais, mas precisam receber os modificadores dos atributos usados.
        // Ex.: MIG -5 em qualquer rolagem que contenha MIG, inclusive aqui.
        const customAttributes = check.dice
          .filter(die => die.kind === "attribute")
          .map(die => die.attribute)
        const crisisBonus = crisisRollModifier(conditions, customAttributes)
        s.monsterCheckRolls = [
          ...(s.monsterCheckRolls || []).slice(-39),
          {
            id: randomUUID(), instanceId: creature.instanceId,
            creatureName: creature.name, checkId: `custom:${check.id}`,
            checkName: check.name, dice, rolls: rolled.rolls,
            result: rolled.result + crisisBonus, at: Date.now(),
            shared: (s as CombatSession & MonsterDiceState).shareMonsterRolls === true,
          },
        ]
        // Testes personalizados não recebem bônus direcionados a testes oficiais.
        if (crisisSelfDamageOnRoll(conditions)) {
          creature.currentHp = Math.max(0, creature.currentHp - 1)
          addLog(s, `${creature.name} sofreu 1 de dano ao rolar sob Atordoamento.`, undefined, 1)
        }
        // Não publicar um evento público; o snapshot filtra por 'shared'.
        break
      }
      case "gm-npc-roll": {
        // A ficha de personagem ainda calcula seus testes no cliente.
        // Recebemos o resultado APENAS do Mestre e o armazenamos no canal
        // privado de rolagens, sem publicá-lo na rota coletiva /roll.
        requireTrue(s.enabled, "Combate não iniciado")
        const npc = character(db, campaignId, text(command.characterId, "NPC"))
        const conditions = crisisForCharacter(s, npc)
        requireTrue(!crisisBlocksRoll(conditions), `${npc.name} está com Paralisia.`, 409)
        requireTrue(getMemberRole(campaign, npc.ownerId) === "gm",
          "Somente NPCs controlados pelo Mestre usam a rolagem privada", 403)
        const checkName = text(command.label, "Nome do teste", 200)
        requireTrue(typeof command.result === "number" && Number.isFinite(command.result)
          && Math.abs(command.result) <= 100000, "Resultado inválido")
        const dice = Array.isArray(command.dice) && command.dice.length <= 10 &&
          command.dice.every(die => typeof die === "string" && /^d\d{1,4}$/.test(die))
          ? (command.dice as string[]) : []
        const breakdown = command.breakdown === undefined
          ? undefined : text(command.breakdown, "Detalhes da rolagem", 500)
        s.monsterCheckRolls = [
          ...(s.monsterCheckRolls || []).slice(-39),
          {
            id: randomUUID(), instanceId: npc.id,
            creatureName: npc.name, checkId: `npc:${npc.id}`, checkName,
            dice, rolls: [], breakdown, result: command.result,
            at: Date.now(), shared: (s as CombatSession & MonsterDiceState).shareMonsterRolls === true,
          },
        ]
        if (crisisSelfDamageOnRoll(conditions)) {
          applyDamage(db, npc, 1, s)
          addLog(s, `${npc.name} sofreu 1 de dano ao rolar sob Atordoamento.`, npc.id, 1)
        }
        break
      }
      case "spawn": {
        const c = validateCreature(command.creature)
        requireTrue(
          !s.creatures.some((x) => x.instanceId === c.instanceId),
          "Instância já existe",
          409,
        )
        s.creatures.push(c)
        addLog(s, `${c.name} entrou em cena.`)
        break
      }
      case "update-creature": {
        const c = getCreature()
        const u = command.updates as Record<string, unknown>
        requireTrue(u && typeof u === "object", "Atualização inválida")
        for (const [key, value] of Object.entries(u)) {
          if (key === "currentHp")
            c.currentHp = integer(value, "HP", 0, c.maxHp)
          else if (key === "currentMp")
            c.currentMp = integer(value, "MP", 0, c.maxMp)
          else if (key === "currentIp")
            c.currentIp = integer(value, "IP", 0, 1000)
          else if (key === "equipment") {
            requireTrue(
              Array.isArray(value) && value.every((x) => typeof x === "string"),
              "Equipamentos inválidos",
            )
            c.equipment = value
          } else throw new CombatError(`Campo não permitido: ${key}`)
        }
        break
      }
      case "remove-creature": {
        const c = getCreature()
        s.creatures = s.creatures.filter((x) => x.instanceId !== c.instanceId)
        break
      }
      case "start":
      case "roster": {
        requireTrue(
          !s.qte || qteComplete(s.qte),
          "Aguarde o QTE terminar antes de alterar participantes",
        )
        requireTrue(
          Array.isArray(command.characterIds) &&
            command.characterIds.length > 0 &&
            command.characterIds.length <= 30,
          "Selecione os participantes",
        )
        const ids = command.characterIds.map((id) => text(id, "Personagem"))
        const owners = new Set<string>()
        for (const id of ids) {
          const c = character(db, campaignId, id)
          const ownerRole = getMemberRole(campaign, c.ownerId)
          requireTrue(
            !!ownerRole,
            "O personagem precisa pertencer a um membro da campanha.",
          )
          requireTrue(!owners.has(c.id), "Personagem repetido na seleção")
          owners.add(c.id)
        }
        s.participantCharacterIds = ids
        roster(db, campaignId, s)
        s.enabled = true
        s.spotlight = spotlightReducer(s.spotlight, { type: "gm-pass" })
        s.actorCharacterId = null
        break
      }
      case "end":
        requireTrue(
          !s.qte || qteComplete(s.qte),
          "O QTE em andamento precisa terminar",
        )
        if (s.pendingAttack) {
          addLog(s, `Combate encerrado pelo Mestre. ${s.pendingAttack.attackName} de ${s.pendingAttack.creatureName} foi cancelado sem aplicar dano.`, s.pendingAttack.characterId)
          s.pendingAttack = null
        }
        s.enabled = false
        s.spotlight = initialSpotlight(s.spotlight.players)
        s.actorCharacterId = null
        s.qte = null
        // Os efeitos em fichas continuam ativos mesmo depois do combate.
        break
      case "save-creature-abilities": {
        const active = getCreature()
        requireTrue(
          !s.qte || qteComplete(s.qte),
          "Aguarde o QTE atual terminar antes de editar habilidades",
        )
        requireTrue(
          Array.isArray(command.abilities),
          "Lista de habilidades inválida",
        )
        requireTrue(
          command.saveForFuture === undefined ||
            typeof command.saveForFuture === "boolean",
          "Opção de cadastro inválida",
        )
        const validated = validateCreature({
          ...active,
          abilities: command.abilities,
        })
        active.abilities = validated.abilities
        active.basicAttacksV2 = validated.basicAttacksV2
        if (command.saveForFuture === true) {
          const raw = db.campaignState.get(campaignId) || {}
          const custom = Array.isArray(raw.customCreatures)
            ? (raw.customCreatures as Array<Record<string, unknown>>)
            : []
          const original =
            custom.find((c) => c.id === active.id) ||
            BESTIARY.find((c) => c.id === active.id) ||
            active
          const definition: Record<string, unknown> = {
            ...original,
            abilities: validated.abilities,
            combatVersion: 2,
          }
          for (const key of [
            "instanceId",
            "currentHp",
            "currentMp",
            "currentIp",
          ])
            delete definition[key]
          db.campaignState.set(campaignId, {
            ...raw,
            customCreatures: [
              ...custom.filter((c) => c.id !== active.id),
              definition,
            ],
            updatedAt: Math.max(Date.now(), Number(raw.updatedAt || 0) + 1),
          })
        }
        addLog(s, `Habilidades de ${active.name} atualizadas pelo Mestre.`)
        break
      }
      case "set-attacks": {
        const id = text(command.characterId, "Personagem")
        character(db, campaignId, id)
        requireTrue(
          Array.isArray(command.attacks) && command.attacks.length <= 30,
          "Ataques inválidos",
        )
        s.playerAttacks[id] = command.attacks.map(validateAttack as any)
        break
      }
      case "request": {
        requireTrue(s.enabled, "Combate não iniciado")
        const ownedParticipants = s.participantCharacterIds.filter(
          (id) => db.characters.get(id)?.ownerId === userId,
        )
        const requestedId =
          command.characterId ??
          (ownedParticipants.length === 1 ? ownedParticipants[0] : undefined)
        requireTrue(
          typeof requestedId === "string",
          "O Mestre precisa incluir seu personagem nos participantes do combate.",
        )
        const c = aliveCharacter(text(requestedId, "Personagem"))
        requireTrue(
          c.ownerId === userId && s.participantCharacterIds.includes(c.id),
          "Você não controla este participante",
          403,
        )
        const next = spotlightReducer(s.spotlight, {
          type: "request",
          actorId: userId,
          requestId: commandId,
        })
        requireTrue(next !== s.spotlight, "Holofote indisponível", 409)
        s.spotlight = next
        s.actorCharacterId = c.id
        break
      }
      case "approve":
      case "cancel": {
        requireTrue(s.enabled, "Combate não iniciado")
        const next = spotlightReducer(s.spotlight, {
          type: command.type,
          actorId: userId,
          requestId: text(command.requestId, "Pedido"),
        })
        requireTrue(
          next !== s.spotlight,
          "Pedido não está disponível para esta ação",
          409,
        )
        s.spotlight = next
        if (command.type === "cancel") s.actorCharacterId = null
        break
      }
      case "finish": {
        requireTrue(
          s.enabled && canAttack(s.spotlight, userId),
          "Você não está com o Holofote",
          403,
        )
        s.spotlight = spotlightReducer(s.spotlight, {
          type: "finish",
          actorId: userId,
        })
        s.actorCharacterId = null
        break
      }
      case "gm-pass":
      case "gm-steal":
      case "gm-round":
      case "gm-spend": {
        requireTrue(s.enabled, "Inicie o combate")
        const action =
          command.type === "gm-round"
            ? {
                type: "gm-round" as const,
                passiveTokens: integer(
                  command.passiveTokens,
                  "Tokens",
                  0,
                  2,
                ) as 0 | 1 | 2,
              }
            : command.type === "gm-spend"
              ? {
                  type: "gm-spend" as const,
                  amount: integer(command.amount, "Tokens", 1),
                }
              : { type: command.type }
        const next = spotlightReducer(s.spotlight, action)
        requireTrue(
          next !== s.spotlight,
          "Ação indisponível ou tokens insuficientes",
        )
        s.spotlight = next
        if (command.type === "gm-pass" || command.type === "gm-steal")
          s.actorCharacterId = null
        break
      }
      case "player-attack": {
        requireTrue(
          s.enabled && canAttack(s.spotlight, userId),
          "Você não está com o Holofote",
          403,
        )
        requireTrue(
          !s.qte || qteComplete(s.qte),
          "Resolva o QTE antes de atacar",
        )
        const c = aliveCharacter(text(command.characterId, "Personagem"))
        requireTrue(!crisisBlocksRoll(crisisForCharacter(s, c)), `${c.name} está com Paralisia.`, 409)
        requireTrue(!isTrainingActive((c as any).training),
          "O personagem está treinando e não pode realizar rolagens.", 409)
        requireTrue(
          c.id === s.actorCharacterId && c.ownerId === userId,
          "Ator inválido",
          403,
        )
        const attack =
          s.playerAttacks[c.id]?.[integer(command.attackIndex, "Ataque", 0, 29)]
        requireTrue(attack, "O Mestre precisa cadastrar este ataque")
        const target = getCreature()
        requireTrue(target.currentHp > 0, "Criatura derrotada")
        const raw = db.campaignState.get(campaignId) || {},
          equipment = Array.isArray(raw.customEquipment)
            ? raw.customEquipment
            : []
        const rolled = characterRollWithCrisis(db, s,
          c,
          attack.attributes,
          attack.name,
          equipment,
          db.users.get(c.ownerId)?.name || "",
          undefined,
          typeof command.bondId === "string" ? command.bondId : undefined,
        )
        const defense =
          attack.targetDefense === "magical" ? target.mdef : target.def
        const damage =
          rolled.total >= defense
            ? affinityDamage(
                rollDamage(attack.damage, random),
                attack.type,
                target.affinities,
              )
            : 0
        target.currentHp = Math.max(
          0,
          Math.min(target.maxHp, target.currentHp - damage),
        )
        s.spotlight = spotlightReducer(s.spotlight, {
          type: "gm-result",
          total: rolled.total,
          defense,
        })
        s.actorCharacterId = null
        addLog(
          s,
          `${c.name} usou ${attack.name} em ${target.name}: ${rolled.total < defense ? "falha" : rolled.total === defense ? "sucesso com custo" : "sucesso limpo"}. ${rolled.total >= defense ? attack.description || "" : ""}`,
        )
        break
      }
      case "monster-attack": {
        requireTrue(
          s.enabled && s.spotlight.side === "gm",
          "O Mestre precisa estar com o Holofote",
        )
        requireTrue(
          !s.qte || qteComplete(s.qte),
          "Resolva o QTE antes de atacar",
        )
        const c = getCreature()
        const conditions = crisisForCreature(s, c)
        requireTrue(!crisisBlocksRoll(conditions), `${c.name} está com Paralisia.`, 409)
        requireTrue(c.currentHp > 0, "Criatura derrotada")
        let attack: Attack,
          cost = { amount: 0, resource: "token" as "token" | "mp" }
        if (typeof command.abilityId === "string") {
          const ability = c.abilities?.find((a) => a.id === command.abilityId)
          requireTrue(
            ability?.kind === "attack",
            "Habilidade de ataque não encontrada",
          )
          attack = ability.attack
          cost = ability.cost
        } else {
          const availableAttacks = c.basicAttacksV2?.length ? c.basicAttacksV2 : legacyAttacks(c)
          attack = availableAttacks[integer(command.attackIndex, "Ataque", 0, 29)]
          requireTrue(attack, "Ataque não encontrado")
        }
        const target = aliveCharacter(text(command.characterId, "Alvo"))
        requireTrue(
          s.participantCharacterIds.includes(target.id),
          "Alvo fora do combate",
        )
        spend(s, c, cost)
        const state = db.campaignState.get(campaignId) || {}
        const defenseEquipment = Array.isArray(state.customEquipment) ? state.customEquipment : []
        const defense = characterDefense(target, attack.targetDefense === "magical", defenseEquipment)
        const crisisBonus = crisisRollModifier(conditions, attack.attributes)
        const result = resolveBestiaryAttack(
          attack,
          c.attributes,
          defense - crisisBonus,
          target.resources.hp,
          random,
        )
        const attackTotal = result.total + crisisBonus
        if (crisisSelfDamageOnRoll(conditions)) {
          c.currentHp = Math.max(0, c.currentHp - 1)
          addLog(s, `${c.name} sofreu 1 de dano ao atacar sob Atordoamento.`, undefined, 1)
        }
        // Defesa contra motores antigos que porventura só rolem dois atributos.
        // Não registra o ataque nem aplica dano se algum dado da fórmula faltar.
        requireTrue(
          result.rolls.length === attack.attributes.length,
          "A rolagem não processou todos os dados da fórmula. Atualize o motor de combate.",
          409,
        )
        const monsterRollShared = (s as CombatSession & MonsterDiceState).shareMonsterRolls === true
        const attackId = randomUUID()
        const at = Date.now()
        // O relógio da imagem é independente da reação e do pendingAttack.
        // Qualquer golpe da criatura com imagem configurada (normal ou habilidade)
        // gera a visualização temporária para o alvo.
        if (validSpecialAttackPreviewUrl(attack.previewImageUrl)) {
          const seconds = attack.previewDurationSeconds === undefined
            ? DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS
            : attack.previewDurationSeconds
          requireTrue(Number.isSafeInteger(seconds) && seconds >= 1 &&
            seconds <= MAX_SPECIAL_ATTACK_PREVIEW_SECONDS,
            "Tempo de visualização da imagem inválido.")
          const preview: MonsterAttackPreview = {
            id: attackId,
            characterId: target.id,
            creatureName: c.name,
            attackName: attack.name,
            imageUrl: attack.previewImageUrl,
            startedAt: at,
            expiresAt: at + seconds * 1000,
          }
          // Retém somente imagens ainda válidas, limitado para evitar crescimento
          // do documento MongoDB e sem alterar habilidades existentes.
          s.attackPreviews = [...(s.attackPreviews || []).filter(entry => entry.expiresAt > at), preview].slice(-8)
        }
        s.log = [{
          ...{ monsterRollShared },
          id: `${attackId}:hit`, at,
          text: `${c.name} usou ${attack.name} em ${target.name}: acerto ${attackTotal}, ${result.outcome === "failure" ? "errou" : "aguardando reação"}.`,
          characterId: target.id,
          roll: {
            type: "dice:roll" as const, characterId: target.id, characterName: c.name,
            playerName: "Mestre",
            attribute: `Ataque inimigo · ${attack.name} [${attack.attributes.map(a => c.attributes[a]).join(" + ")}]`,
            result: attackTotal, breakdown: result.rolls.join(" + "), modifier: crisisBonus,
          },
        }, ...s.log].slice(0, 60)
        if (result.outcome !== "failure") {
          s.pendingAttack = {
            ...{ monsterRollShared },
            id: attackId, at, characterId: target.id, creatureName: c.name,
            attackName: attack.name, total: attackTotal, rolls: result.rolls,
            dice: attack.attributes.map(a => c.attributes[a]),
            damage: affinityDamage(result.damage, attack.type, (target as any).affinities || {}),
            effect: result.effect,
          }
        } else {
          addLog(s, `${c.name} errou ${target.name}. Nenhum dano aplicado.`, target.id)
          s.spotlight = spotlightReducer(s.spotlight, { type: "gm-pass" })
          s.actorCharacterId = null
        }
        break
      }
      case "answer-attack": {
        const attack = s.pendingAttack
        requireTrue(attack && attack.id === command.attackId, "Ataque já resolvido ou inexistente", 409)
        const target = character(db, campaignId, attack.characterId)
        requireTrue(target.ownerId === userId, "Somente o jogador atingido pode responder", 403)
        requireTrue(command.choice === "react" || command.choice === "pass", "Escolha inválida")
        requireTrue(Date.now() >= attack.at + 4400, "Aguarde a rolagem de acerto terminar", 409)
        let avoided = false
        if (command.choice === "react") {
          requireTrue(!isTrainingActive((target as any).training),
            "O personagem está treinando e não pode rolar Reflexos.", 409)
          addLog(s, `${target.name} decidiu reagir a ${attack.attackName}.`, target.id)
          const check = checkDefinition("c23")
          const raw = db.campaignState.get(campaignId) || {}
          const rolled = characterRollWithCrisis(db, s, target, check.attrs, check.name,
            Array.isArray(raw.customEquipment) ? raw.customEquipment : [],
            db.users.get(target.ownerId)?.name || "", check.id)
          avoided = rolled.total >= attack.total
          s.log = [{
            ...{ monsterRollShared: (attack as typeof attack & { monsterRollShared?: boolean }).monsterRollShared !== false },
            id: `${attack.id}:reflex`, at: Date.now(), characterId: target.id,
            text: `${target.name}: Reflexos ${rolled.total} contra ${attack.total} — ${avoided ? "sucesso" : "falha"}.`,
            roll: {
              type: "dice:roll" as const, characterId: target.id, characterName: target.name,
              playerName: db.users.get(target.ownerId)?.name || "Jogador",
              attribute: `Reflexos contra ${attack.total} [${check.attrs.map(a => target.attributes[a as keyof Character["attributes"]]).join(" + ")}]`,
              result: rolled.total, breakdown: rolled.rolls.join(" + "), modifier: rolled.modifier,
            },
          }, ...s.log].slice(0, 60)
        } else {
          addLog(s, `${target.name} decidiu deixar passar ${attack.attackName}.`, target.id)
        }
        if (avoided) {
          addLog(s, `${target.name} evitou ${attack.attackName} de ${attack.creatureName}. Nenhum dano aplicado.`, target.id)
        } else {
          applyDamage(db, target, attack.damage, s)
          addLog(s, `${attack.creatureName} atingiu ${target.name} com ${attack.attackName}: ${attack.damage < 0 ? `absorveu ${-attack.damage} HP` : `${attack.damage} de dano`}. ${attack.effect}`, target.id, attack.damage)
        }
        s.pendingAttack = null
        s.spotlight = spotlightReducer(s.spotlight, { type: "gm-pass" })
        s.actorCharacterId = null
        break
      }
      case "start-qte": {
        requireTrue(
          s.enabled && s.spotlight.side === "gm",
          "O Mestre precisa estar com o Holofote",
        )
        requireTrue(
          !s.qte || qteComplete(s.qte),
          "Já existe um QTE em andamento",
        )
        const c = getCreature()
        requireTrue(c.currentHp > 0, "Criatura derrotada")
        const a = c.abilities?.find((a) => a.id === command.abilityId)
        requireTrue(a?.kind === "qte", "QTE não encontrado")
        const targets = s.participantCharacterIds.filter(
          (id) => (db.characters.get(id)?.resources.hp || 0) > 0,
        )
        requireTrue(targets.length, "Nenhum alvo vivo")
        spend(s, c, a.cost)
        s.qte = createQte(randomUUID(), a, targets, Date.now())
        addLog(s, `${c.name}: ${a.name}!`)
        break
      }
      case "react": {
        const q = s.qte
        requireTrue(q && q.id === command.qteId, "QTE encerrado", 409)
        const c = character(
          db,
          campaignId,
          text(command.characterId, "Personagem"),
        )
        requireTrue(!isTrainingActive((c as any).training),
          "O personagem está treinando e não pode realizar o teste de reação.", 409)
        requireTrue(
          c.ownerId === userId && q.targets.includes(c.id),
          "Este QTE não é seu",
          403,
        )
        if (!q.outcomes[c.id]) {
          const check = checkDefinition(q.ability.checkId),
            raw = db.campaignState.get(campaignId) || {}
          const rolled = characterRollWithCrisis(db, s,
            c,
            check.attrs,
            check.name,
            Array.isArray(raw.customEquipment) ? raw.customEquipment : [],
            db.users.get(c.ownerId)?.name || "",
            check.id,
            typeof command.bondId === "string" ? command.bondId : undefined,
          )
          const answered = answerQte(
            q,
            q.id,
            c.id,
            rolled.total,
            Date.now(),
            random,
          )
          if (answered.outcomes[c.id]?.total != null) {
            s.log = [
              ...s.log,
              {
                id: `${q.id}:${c.id}:roll`,
                at: Date.now(),
                text: `${c.name} · ${q.ability.name}: ${rolled.total}`,
                characterId: c.id,
                roll: {
                  type: "dice:roll" as const,
                  characterId: c.id,
                  characterName: c.name,
                  playerName: db.users.get(c.ownerId)?.name || "Jogador",
                  attribute: `QTE · ${q.ability.name} · ${check.name} [${check.attrs.map((a) => c.attributes[a as keyof Character["attributes"]]).join(" + ")}]`,
                  result: rolled.total,
                  breakdown: rolled.rolls.join(" + "),
                  modifier: rolled.modifier,
                },
              },
            ].slice(-60)
          }
          finishQte(db, campaignId, s, answered)
        }
        break
      }
      case "close-qte":
        requireTrue(!s.qte || qteComplete(s.qte), "O QTE ainda não terminou")
        s.qte = null
        break
      default:
        throw new CombatError("Comando de combate desconhecido")
    }
    advanceCrisis(db, campaignId, s, Date.now(), updatedIds)
    s.receipts = [...s.receipts, receipt].slice(-2000)
    saveRevision(db, campaignId, s)
    return {
      value: {
        view: snapshot(db, campaignId, s, userId),
        session: s,
        changed: true,
      },
      changed: true,
    }
  })
  if (result.changed) signal(campaignId, result.session.revision)
  signalCrisisCharacters(campaignId, updatedIds)
  schedule(campaignId, result.session)
  return result.view
}
// Não iniciar cronômetros na importação do módulo: o MongoDB é carregado de
// modo assíncrono e prazos antigos não devem provocar cobranças retroativas.
// getCombat/commandCombat reconstroem o agendamento ao acessar a campanha.
