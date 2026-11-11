import type { AttributeKey } from "./types"

/**
 * O endpoint atual de golpes guarda descrição mas pode filtrar campos desconhecidos.
 * Esse sufixo compatível com registros antigos persiste os dados extras sem alterar
 * o contrato da API. Nunca é exibido como parte da descrição narrativa.
 */
const MARKER = /(?:\r?\n){0,2}\[NPC-DADOS:((?:dex|ins|mig|wlp)(?:,(?:dex|ins|mig|wlp)){0,9})\]\s*$/i
const ATTRS = new Set<AttributeKey>(["dex", "ins", "mig", "wlp"])
export const MAX_NPC_EXTRA_DICE = 10

export function npcAttackDescription(raw: string | undefined): string {
  return String(raw ?? "").replace(FIXED_MARKER, "").replace(MARKER, "").trimEnd()
}

/** Preserva a ordem e as repetições: 4x DEX + 3x MIG são sete dados. */
export function readNpcExtraDice(description: string | undefined): AttributeKey[] {
  const match = String(description ?? "").replace(FIXED_MARKER, "").match(MARKER)
  return match ? match[1].toLowerCase().split(",") as AttributeKey[] : []
}

export function writeNpcExtraDice(description: string | undefined, dice: readonly AttributeKey[]): string {
  if (!Array.isArray(dice) || dice.length > MAX_NPC_EXTRA_DICE || dice.some(die => !ATTRS.has(die))) {
    throw new Error("Escolha de zero a dez dados dos atributos DEX, INS, MIG e VON.")
  }
  const fixed = readNpcFixedDice(description)
  const narrative = npcAttackDescription(description)
  const marker = dice.length ? `${narrative ? "\n\n" : ""}[NPC-DADOS:${dice.join(",")}]` : ""
  const withFixed = writeNpcFixedDice(narrative + marker, fixed)
  if (withFixed.length > 4000) throw new Error("Descrição e dados extras excedem 4.000 caracteres.")
  return withFixed
}

/** Dados de faces fixas, independentes dos atributos, para ataques de NPC. */
const FIXED_MARKER = /(?:\r?\n){0,2}\[NPC-FIXOS:((?:d(?:6|8|10|12|14|18|20))(?:,d(?:6|8|10|12|14|18|20)){0,9})\]\s*$/i
const FIXED_SIDES = new Set([6,8,10,12,14,18,20])
export function readNpcFixedDice(description: string | undefined): number[] {
  const match = String(description ?? '').match(FIXED_MARKER)
  return match ? match[1].toLowerCase().split(',').map(s => Number(s.slice(1))) : []
}
export function writeNpcFixedDice(description: string | undefined, dice: readonly number[]): string {
  if (!Array.isArray(dice) || dice.length > MAX_NPC_EXTRA_DICE || dice.some(sides => !FIXED_SIDES.has(sides)))
    throw new Error('Dados fixos permitidos: d6, d8, d10, d12, d14, d18, d20 (até 10).')
  const stripped = String(description ?? '').replace(FIXED_MARKER, '').trimEnd()
  const result = stripped + (dice.length ? `${stripped ? '\n\n' : ''}[NPC-FIXOS:${dice.map(s => `d${s}`).join(',')}]` : '')
  if (result.length > 4000) throw new Error('Descrição e dados excedem 4.000 caracteres.')
  return result
}
