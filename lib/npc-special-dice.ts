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
  return String(raw ?? "").replace(MARKER, "").trimEnd()
}

/** Preserva a ordem e as repetições: 4x DEX + 3x MIG são sete dados. */
export function readNpcExtraDice(description: string | undefined): AttributeKey[] {
  const match = String(description ?? "").match(MARKER)
  return match ? match[1].toLowerCase().split(",") as AttributeKey[] : []
}

export function writeNpcExtraDice(description: string | undefined, dice: readonly AttributeKey[]): string {
  if (!Array.isArray(dice) || dice.length > MAX_NPC_EXTRA_DICE || dice.some(die => !ATTRS.has(die))) {
    throw new Error("Escolha de zero a dez dados dos atributos DEX, INS, MIG e VON.")
  }
  const narrative = npcAttackDescription(description)
  const marker = dice.length ? `${narrative ? "\n\n" : ""}[NPC-DADOS:${dice.join(",")}]` : ""
  if (narrative.length + marker.length > 4000) throw new Error("Descrição e dados extras excedem 4.000 caracteres.")
  return narrative + marker
}
