import "server-only"
import { BESTIARY } from "./game-data"
import { randomUUID } from "node:crypto"
import { store, transactStore, getMemberRole, publish } from "./store"
import {
  initialSpotlight,
  spotlightReducer,
  canAttack,
  validateCombat,
  rollDamage,
  type Attack,
  type Ability,
} from "./combat-model"
import { answerQte, createQte, expireQte, qteComplete } from "./qte-model"
import { resolveAttack } from "./automated-attack"
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
} from "./combat-types"
import type { Character, RealtimeEvent } from "./types"
type Database = Parameters<Parameters<typeof transactStore>[0]>[0]
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
function applyDamage(db: Database, c: Character, damage: number) {
  const hp = Math.max(0, Math.min(c.resources.maxHp, c.resources.hp - damage))
  db.characters.set(c.id, {
    ...c,
    resources: { ...c.resources, hp },
    updatedAt: Math.max(Date.now(), Number(c.updatedAt || 0) + 1),
  })
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
    applyDamage(db, c, result.damage)
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
  const { receipts, ...publicState } = s
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
const timersGlobal = globalThis as unknown as {
  __combatTimers?: Map<string, ReturnType<typeof setTimeout>>
}
const timers = (timersGlobal.__combatTimers ??= new Map())
function schedule(campaignId: string, s: CombatSession) {
  const existing = timers.get(campaignId)
  if (existing) clearTimeout(existing)
  timers.delete(campaignId)
  if (!s.qte || qteComplete(s.qte)) return
  const timer = setTimeout(
    () => {
      timers.delete(campaignId)
      try {
        const result = transactStore((db) => {
          const current = db.combatSessions.get(campaignId)
          if (!current || !db.campaigns.has(campaignId))
            return { value: null, changed: false }
          const changed = expire(db, campaignId, current)
          if (changed) saveRevision(db, campaignId, current)
          return { value: { session: current, changed }, changed }
        })
        if (result) {
          if (result.changed) signal(campaignId, result.session.revision)
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
    Math.max(1, s.qte.deadline - Date.now()),
  )
  timer.unref?.()
  timers.set(campaignId, timer)
}
export function getCombat(campaignId: string, userId: string): CombatSnapshot {
  const result = transactStore((db) => {
    authorize(db, campaignId, userId)
    const s = db.combatSessions.get(campaignId) || newSession()
    const expired = expire(db, campaignId, s)
    const changed = roster(db, campaignId, s) || expired
    if (changed) saveRevision(db, campaignId, s)
    return {
      value: { view: snapshot(db, campaignId, s, userId), session: s, changed },
      changed,
    }
  })
  if (result.changed) signal(campaignId, result.session.revision)
  schedule(campaignId, result.session)
  return result.view
}
function validateAttack(value: unknown): Attack {
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
  const error = validateCombat([a], [])
  requireTrue(!error, error || "")
  if (a.description !== undefined)
    requireTrue(
      typeof a.description === "string" && a.description.length <= 2000,
      "Efeito muito longo",
    )
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
  c.currentHp = integer(c.currentHp ?? c.maxHp, "HP", 0, c.maxHp)
  c.currentMp = integer(c.currentMp ?? c.maxMp, "MP", 0, c.maxMp)
  c.basicAttacksV2 = legacyAttacks(c).map(validateAttack)
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
      if (a.kind === "attack") validateAttack(a.attack)
      if (a.kind === "qte") checkDefinition(a.checkId)
    }
    const error = validateCombat(
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
export function commandCombat(
  campaignId: string,
  userId: string,
  input: unknown,
): CombatSnapshot {
  requireTrue(
    input && typeof input === "object" && !Array.isArray(input),
    "Comando inválido",
  )
  const command = input as CombatCommand
  const commandId = text(command.commandId, "ID do comando", 100)
  text(command.type, "Tipo", 40)
  const result = transactStore((db) => {
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
    const scoped = ["approve", "cancel", "react", "answer-attack"].includes(command.type)
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
    if (s.pendingAttack && !["answer-attack", "end"].includes(command.type)) {
      throw new CombatError("Aguarde o jogador resolver o ataque pendente", 409)
    }
    switch (command.type) {
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
        s.playerAttacks[id] = command.attacks.map(validateAttack)
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
        const rolled = characterRoll(
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
          attack =
            legacyAttacks(c)[integer(command.attackIndex, "Ataque", 0, 29)]
          requireTrue(attack, "Ataque não encontrado")
        }
        const target = aliveCharacter(text(command.characterId, "Alvo"))
        requireTrue(
          s.participantCharacterIds.includes(target.id),
          "Alvo fora do combate",
        )
        spend(s, c, cost)
        const result = resolveAttack(
          attack,
          c.attributes,
          characterDefense(target, attack.targetDefense === "magical"),
          target.resources.hp,
          0,
          random,
        )
        const attackId = randomUUID()
        const at = Date.now()
        s.log = [{
          id: `${attackId}:hit`, at,
          text: `${c.name} usou ${attack.name} em ${target.name}: acerto ${result.total}, ${result.outcome === "failure" ? "errou" : "aguardando reação"}.`,
          characterId: target.id,
          roll: {
            type: "dice:roll", characterId: target.id, characterName: c.name,
            playerName: "Mestre",
            attribute: `Ataque inimigo · ${attack.name} [${attack.attributes.map(a => c.attributes[a]).join(" + ")}]`,
            result: result.total, breakdown: result.rolls.join(" + "), modifier: 0,
          },
        }, ...s.log].slice(0, 60)
        if (result.outcome !== "failure") {
          s.pendingAttack = {
            id: attackId, at, characterId: target.id, creatureName: c.name,
            attackName: attack.name, total: result.total, rolls: result.rolls,
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
          addLog(s, `${target.name} decidiu reagir a ${attack.attackName}.`, target.id)
          const check = checkDefinition("c23")
          const raw = db.campaignState.get(campaignId) || {}
          const rolled = characterRoll(target, check.attrs, check.name,
            Array.isArray(raw.customEquipment) ? raw.customEquipment : [],
            db.users.get(target.ownerId)?.name || "", check.id)
          avoided = rolled.total >= attack.total
          s.log = [{
            id: `${attack.id}:reflex`, at: Date.now(), characterId: target.id,
            text: `${target.name}: Reflexos ${rolled.total} contra ${attack.total} — ${avoided ? "sucesso" : "falha"}.`,
            roll: {
              type: "dice:roll", characterId: target.id, characterName: target.name,
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
          applyDamage(db, target, attack.damage)
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
        requireTrue(
          c.ownerId === userId && q.targets.includes(c.id),
          "Este QTE não é seu",
          403,
        )
        if (!q.outcomes[c.id]) {
          const check = checkDefinition(q.ability.checkId),
            raw = db.campaignState.get(campaignId) || {}
          const rolled = characterRoll(
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
  schedule(campaignId, result.session)
  return result.view
}
// Recover durable deadlines after a process restart. Missed deadlines resolve once under the disk lock.
for (const [id, s] of store.combatSessions) schedule(id, s)
