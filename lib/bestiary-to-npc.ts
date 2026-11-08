import type { Creature } from "./types"
import type { NPCDraft } from "@/components/character-sheet"
import type { CustomCheck } from "./custom-checks"
import { BASE_MAX_IP } from "./game-data"

/** Correspondência direta: preserva estatísticas sem inventar classes. */
export function bestiaryToNpc(creature: Creature, id: string): NPCDraft {
  const attacks = creature.basicAttacksV2?.length ? creature.basicAttacksV2 : creature.basicAttacks.map(attack => ({ ...attack, targetDefense: /Defesa Mágica/i.test(attack.description || "") ? "magical" : "physical", damage: attack.description?.match(/Dano:\s*([^;]+)/i)?.[1] || String(attack.damage) }))
  const allAttacks = [...attacks, ...(creature.abilities || []).flatMap(ability => ability.kind === "attack" ? [{ ...ability.attack, name: ability.name, description: `${ability.attack.description || ""}\nCusto: ${ability.cost.amount} ${ability.cost.resource}` }] : [])]
  const npcChecks: CustomCheck[] = allAttacks.map((attack, index) => ({
    id: `npc_attack_${index}`, name: attack.name.slice(0, 100),
    description: `Dano: ${attack.damage} (${attack.type}). Defesa alvo: ${attack.targetDefense === "magical" ? "mágica" : "física"}. ${attack.description || ""}`.slice(0, 1000),
    dice: attack.attributes.map(attribute => ({ kind: "attribute" as const, attribute })), isPublic: false,
  }))
  return {
    id, sourceBestiaryId: creature.id, name: creature.name, avatarUrl: creature.imageUrl,
    origin: creature.species, identity: creature.species,
    theme: [...creature.spells, ...(creature.abilities || []).filter(ability => ability.kind !== "attack").map(ability => JSON.stringify(ability))].join("\n"),
    attributes: { ...creature.attributes }, classes: [], skills: {}, equipment: [...creature.equipment],
    npcLevel: creature.level, npcChecks, bestiaryAffinities: structuredClone(creature.affinities),
    customModifiers: [
      { id: "sheet_defense:physical", name: "Defesa manual", target: "sheet_defense_hidden", value: creature.def },
      { id: "sheet_defense:magical", name: "Defesa mágica manual", target: "sheet_defense_hidden", value: creature.mdef },
    ],
    resources: { hp: creature.maxHp, maxHp: creature.maxHp, mp: creature.maxMp, maxMp: creature.maxMp, ip: BASE_MAX_IP, maxIp: BASE_MAX_IP, fp: 0, xp: 0 },
  }
}
