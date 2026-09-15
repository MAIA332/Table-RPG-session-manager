export const ATTRIBUTES = ["dex", "ins", "mig", "wlp"] as const
export type Attribute = (typeof ATTRIBUTES)[number]
export type Defense = "physical" | "magical"
export type Attack = {
  name: string
  attributes: Attribute[]
  targetDefense: Defense
  damage: string
  type: string
  description?: string
}
export type Cost = { amount: number; resource: "mp" | "token" }
export type Ability =
  | { id: string; kind: "attack"; name: string; cost: Cost; attack: Attack }
  | {
      id: string
      kind: "passive"
      name: string
      trigger: string
      effect: string
    }
  | {
      id: string
      kind: "qte"
      name: string
      cost: Cost
      seconds: 5 | 7 | 10 | 15 | 20
      checkId: string
      difficulty: number
      failureDamage: string
      failureEffect: string
      successDamage: string
      successEffect: string
    }
export type CreatureCombat = {
  basicAttacksV2: Attack[]
  abilities: Ability[]
  combatVersion: 2
}
export const defaultAttack = (): Attack => ({
  name: "Golpe",
  attributes: ["mig", "mig"],
  targetDefense: "physical",
  damage: "10",
  type: "físico",
})
export function newAbility(kind: Ability["kind"], id: string): Ability {
  if (kind === "passive")
    return { id, kind, name: "Nova passiva", trigger: "", effect: "" }
  if (kind === "qte")
    return {
      id,
      kind,
      name: "Nova ação de área",
      cost: { amount: 0, resource: "token" },
      seconds: 7,
      checkId: "dex",
      difficulty: 12,
      failureDamage: "10",
      failureEffect: "",
      successDamage: "0",
      successEffect: "",
    }
  return {
    id,
    kind,
    name: "Novo ataque",
    cost: { amount: 0, resource: "mp" },
    attack: defaultAttack(),
  }
}
export function validDamage(input: string): boolean {
  const s = input.trim()
  if (/^\d+$/.test(s)) return Number(s) <= 100000
  const m = /^(\d{1,2})d(\d{1,3})([+-]\d{1,5})?$/i.exec(s)
  return !!m && +m[1] > 0 && +m[1] <= 50 && +m[2] >= 2 && +m[2] <= 100
}
export function rollDamage(input: string, random = Math.random): number {
  if (!validDamage(input))
    throw new Error(
      "Dano inválido. Use 10 ou 2d6+2 (até 50 dados de d2 a d100).",
    )
  if (/^\d+$/.test(input.trim())) return +input
  const m = /^(\d+)d(\d+)([+-]\d+)?$/i.exec(input.trim())!
  return Math.max(
    0,
    Array.from(
      { length: +m[1] },
      () => Math.floor(random() * +m[2]) + 1,
    ).reduce((a, b) => a + b, 0) + +(m[3] || 0),
  )
}
export function validateCombat(
  attacks: Attack[],
  abilities: Ability[],
): string | null {
  const attackError = (a: Attack) =>
    !a.name.trim() ||
    !validDamage(a.damage) ||
    a.attributes.length !== 2 ||
    a.attributes.some((x) => !ATTRIBUTES.includes(x))
  if (!attacks.length || attacks.some(attackError))
    return "Preencha o nome, os dois atributos e um dano válido em cada ataque."
  for (const a of abilities) {
    if (!a.name.trim()) return "Todas as habilidades precisam de nome."
    if (
      a.kind !== "passive" &&
      (!Number.isSafeInteger(a.cost.amount) || a.cost.amount < 0)
    )
      return "O custo precisa ser um inteiro não negativo."
    if (a.kind === "attack" && attackError(a.attack))
      return "Revise o ataque da habilidade."
    if (a.kind === "passive" && (!a.trigger.trim() || !a.effect.trim()))
      return "Preencha o gatilho e o efeito da passiva."
    if (
      a.kind === "qte" &&
      (!Number.isSafeInteger(a.difficulty) ||
        a.difficulty < 0 ||
        !validDamage(a.failureDamage) ||
        !validDamage(a.successDamage) ||
        !a.checkId ||
        ![5, 7, 10, 15, 20].includes(a.seconds))
    )
      return "Revise dificuldade, teste, tempo e danos do QTE."
  }
  return null
}
export type Player = { id: string; name: string; avatar?: string }
export type Request = {
  id: string
  playerId: string
  required: string[]
  approved: string[]
}
export type SpotlightState = {
  side: "group" | "gm"
  activePlayerId: string | null
  request: Request | null
  tokens: number
  players: Player[]
  approverIds?: string[]
}
export type SpotlightAction =
  | { type: "request"; actorId: string; requestId: string }
  | { type: "approve"; actorId: string; requestId: string }
  | { type: "cancel"; actorId: string; requestId: string }
  | { type: "finish"; actorId: string }
  | { type: "gm-pass" }
  | { type: "gm-steal" }
  | { type: "gm-spend"; amount: number }
  | { type: "gm-round"; passiveTokens: 0 | 1 | 2 }
  | { type: "gm-result"; total: number; defense: number }
  | { type: "gm-roster"; players: Player[]; approverIds?: string[] }
export function initialSpotlight(players: Player[]): SpotlightState {
  return {
    side: "group",
    activePlayerId: null,
    request: null,
    tokens: 0,
    players: Array.from(new Map(players.map((p) => [p.id, p])).values()),
  }
}
// Pure reducer: authenticate the action's sender in the shared transport, not in a client payload.
export function spotlightReducer(
  s: SpotlightState,
  a: SpotlightAction,
): SpotlightState {
  switch (a.type) {
    case "request": {
      if (
        s.side !== "group" ||
        s.activePlayerId ||
        s.request ||
        !s.players.some((p) => p.id === a.actorId)
      )
        return s
      const required = [
        ...new Set([...s.players.map((p) => p.id), ...(s.approverIds || [])]),
      ].filter((id) => id !== a.actorId)
      return required.length
        ? {
            ...s,
            request: {
              id: a.requestId,
              playerId: a.actorId,
              required,
              approved: [],
            },
          }
        : { ...s, activePlayerId: a.actorId }
    }
    case "approve": {
      const r = s.request
      if (
        !r ||
        r.id !== a.requestId ||
        !r.required.includes(a.actorId) ||
        r.approved.includes(a.actorId)
      )
        return s
      const approved = [...r.approved, a.actorId]
      return approved.length === r.required.length
        ? { ...s, activePlayerId: r.playerId, request: null }
        : { ...s, request: { ...r, approved } }
    }
    case "cancel":
      return s.request?.id === a.requestId && s.request.playerId === a.actorId
        ? { ...s, request: null }
        : s
    case "finish":
      return s.activePlayerId === a.actorId ? { ...s, activePlayerId: null } : s
    case "gm-pass":
      return { ...s, side: "group", activePlayerId: null, request: null }
    case "gm-steal":
      return s.tokens >= 1 && s.side !== "gm"
        ? {
            ...s,
            tokens: s.tokens - 1,
            side: "gm",
            activePlayerId: null,
            request: null,
          }
        : s
    case "gm-spend":
      return Number.isSafeInteger(a.amount) &&
        a.amount > 0 &&
        s.tokens >= a.amount
        ? { ...s, tokens: s.tokens - a.amount }
        : s
    case "gm-round":
      return [0, 1, 2].includes(a.passiveTokens)
        ? { ...s, tokens: s.tokens + a.passiveTokens }
        : s
    case "gm-result": {
      if (!Number.isFinite(a.total) || !Number.isFinite(a.defense)) return s
      const failure = a.total < a.defense
      return {
        ...s,
        tokens: s.tokens + (a.total <= a.defense ? 1 : 0),
        side: failure ? "gm" : "group",
        activePlayerId: null,
        request: null,
      }
    }
    case "gm-roster":
      return {
        ...initialSpotlight(a.players),
        approverIds: a.approverIds || [],
        tokens: s.tokens,
        side: s.side,
      }
  }
}
export const canAttack = (s: SpotlightState, playerId: string) =>
  s.side === "group" && s.activePlayerId === playerId && !s.request
export function healthLabel(current: number, max: number) {
  const ratio = max > 0 ? current / max : 0
  return ratio <= 0
    ? "Derrotado"
    : ratio <= 0.2
      ? "Quase morto"
      : ratio <= 0.5
        ? "Muito ferido"
        : ratio < 1
          ? "Sangrando"
          : "Ileso"
}
