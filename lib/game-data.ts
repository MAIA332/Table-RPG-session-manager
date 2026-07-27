import type { AttributeKey, DieSize, EquipmentItem } from "./types"

// Perfis de distribuicao de atributos (Passo 3 do guia)
export interface AttributeProfile {
  id: string
  name: string
  description: string
  dice: Record<AttributeKey, DieSize>
}

export const ATTRIBUTE_PROFILES: AttributeProfile[] = [
  {
    id: "balanced",
    name: "Equilibrado",
    description: "Bom em tudo, mestre de nada.",
    dice: { dex: "d8", ins: "d8", mig: "d8", wlp: "d8" },
  },
  {
    id: "focused",
    name: "Focado",
    description: "Uma virtude clara, com boa versatilidade.",
    dice: { dex: "d10", ins: "d8", mig: "d8", wlp: "d6" },
  },
  {
    id: "specialist",
    name: "Especialista",
    description: "Dois picos de excelencia, com fraquezas.",
    dice: { dex: "d10", ins: "d10", mig: "d6", wlp: "d6" },
  },
]

export const ATTRIBUTE_META: Record<
  AttributeKey,
  { label: string; short: string; description: string }
> = {
  dex: { label: "Destreza", short: "DEX", description: "Agilidade e reflexos." },
  ins: { label: "Intuicao", short: "INS", description: "Raciocinio e percepcao magica." },
  mig: { label: "Vigor", short: "MIG", description: "Forca e resistencia fisica." },
  wlp: { label: "Vontade", short: "WLP", description: "Carisma e determinacao." },
}

export const DIE_ORDER: DieSize[] = ["d6", "d8", "d10", "d12"]

export interface GameSkill {
  id: string
  name: string
  maxLevel: number
  description: string
}

export interface GameClass {
  id: string
  name: string
  archetype: string
  description: string
  // recursos base que a classe adiciona por nivel investido
  hpPerLevel: number
  mpPerLevel: number
  primaryAttribute: AttributeKey
  skills: GameSkill[]
}

// Subconjunto representativo de classes (resumos proprios das mecanicas)
export const CLASSES: GameClass[] = [
  {
    id: "weaponmaster",
    name: "Mestre de Armas",
    archetype: "Combate marcial",
    description: "Especialista em armas corpo a corpo e manobras de batalha.",
    hpPerLevel: 5,
    mpPerLevel: 2,
    primaryAttribute: "mig",
    skills: [
      { id: "wm-bladestorm", name: "Tempestade de Laminas", maxLevel: 5, description: "Aumenta o dano com armas melee conforme o nivel." },
      { id: "wm-breach", name: "Ruptura", maxLevel: 3, description: "Ignora parte da defesa de armaduras pesadas." },
    ],
  },
  {
    id: "elementalist",
    name: "Elementalista",
    archetype: "Conjurador arcano",
    description: "Manipula fogo, gelo, raio e outros elementos primordiais.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "ins",
    skills: [
      { id: "el-spellblade", name: "Afinidade Elemental", maxLevel: 5, description: "Desbloqueia feiticos elementais e reduz custo de MP." },
      { id: "el-focus", name: "Foco Arcano", maxLevel: 3, description: "Aumenta o dano magico do dano elemental." },
    ],
  },
  {
    id: "guardian",
    name: "Guardiao",
    archetype: "Tanque protetor",
    description: "Escuda aliados e absorve o impacto dos golpes inimigos.",
    hpPerLevel: 6,
    mpPerLevel: 2,
    primaryAttribute: "mig",
    skills: [
      { id: "gu-fortress", name: "Fortaleza", maxLevel: 5, description: "Aumenta HP maximo e defesa ao usar escudos." },
      { id: "gu-protect", name: "Proteger", maxLevel: 1, description: "Intercepta um ataque direcionado a um aliado proximo." },
    ],
  },
  {
    id: "sharpshooter",
    name: "Franco-atirador",
    archetype: "Combate a distancia",
    description: "Domina armas de longo alcance e disparos precisos.",
    hpPerLevel: 4,
    mpPerLevel: 3,
    primaryAttribute: "dex",
    skills: [
      { id: "sh-barrage", name: "Barragem", maxLevel: 5, description: "Permite atacar multiplos alvos com armas a distancia." },
      { id: "sh-ricochet", name: "Ricochete", maxLevel: 3, description: "O disparo salta para um segundo alvo." },
    ],
  },
  {
    id: "spiritist",
    name: "Espiritista",
    archetype: "Suporte e cura",
    description: "Canaliza energia espiritual para curar e reviver aliados.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "wlp",
    skills: [
      { id: "sp-mend", name: "Reparar Corpo", maxLevel: 5, description: "Restaura HP de aliados gastando MP." },
      { id: "sp-ward", name: "Egide Espiritual", maxLevel: 3, description: "Concede resistencia temporaria a status." },
    ],
  },
  {
    id: "rogue",
    name: "Ladino",
    archetype: "Agilidade e furtividade",
    description: "Mestre de golpes rapidos, evasao e oportunismo.",
    hpPerLevel: 4,
    mpPerLevel: 3,
    primaryAttribute: "dex",
    skills: [
      { id: "ro-dodge", name: "Esquiva Perfeita", maxLevel: 5, description: "Aumenta a defesa contra ataques fisicos." },
      { id: "ro-sneak", name: "Golpe Furtivo", maxLevel: 3, description: "Dano extra ao atacar alvos desprevenidos." },
    ],
  },
  {
    id: "orator",
    name: "Orador",
    archetype: "Lider e diplomata",
    description: "Inspira aliados e domina o campo social com palavras.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "wlp",
    skills: [
      { id: "or-condition", name: "Condicionar", maxLevel: 5, description: "Aplica emocoes que fortalecem aliados." },
      { id: "or-persuade", name: "Persuasao Ferrenha", maxLevel: 3, description: "Bonus em testes sociais e de vontade." },
    ],
  },
  {
    id: "tinkerer",
    name: "Engenhoqueiro",
    archetype: "Inventor magitech",
    description: "Constroi engenhocas, pocoes e dispositivos improvisados.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "ins",
    skills: [
      { id: "ti-gadgets", name: "Engenhocas", maxLevel: 5, description: "Cria dispositivos de uso unico em combate." },
      { id: "ti-alchemy", name: "Alquimia", maxLevel: 3, description: "Prepara misturas com efeitos variados." },
    ],
  },
]

export function getClass(id: string): GameClass | undefined {
  return CLASSES.find((c) => c.id === id)
}

// Lista de equipamentos basicos (custos em zenit)
export const EQUIPMENT: EquipmentItem[] = [
  { id: "eq-dagger", name: "Adaga", category: "weapon", cost: 100, detail: "Arma leve. DEX + INS, dano fisico." },
  { id: "eq-sword", name: "Espada", category: "weapon", cost: 300, detail: "Arma marcial. DEX + MIG, dano fisico." },
  { id: "eq-greatsword", name: "Montante", category: "weapon", cost: 400, detail: "Arma pesada. MIG + MIG, dano fisico alto." },
  { id: "eq-bow", name: "Arco", category: "weapon", cost: 300, detail: "Arma a distancia. DEX + INS, dano fisico." },
  { id: "eq-staff", name: "Cajado Arcano", category: "weapon", cost: 200, detail: "Foco magico. INS + WLP, dano magico." },
  { id: "eq-spear", name: "Lanca", category: "weapon", cost: 200, detail: "Arma de haste. DEX + MIG, dano fisico." },
  { id: "eq-leather", name: "Armadura de Couro", category: "armor", cost: 100, detail: "Leve. Defesa base pela DEX." },
  { id: "eq-mail", name: "Cota de Malha", category: "armor", cost: 300, detail: "Media. Defesa fixa, sem bonus de DEX." },
  { id: "eq-plate", name: "Armadura de Placas", category: "armor", cost: 400, detail: "Pesada. Alta defesa, reduz iniciativa." },
  { id: "eq-buckler", name: "Broquel", category: "shield", cost: 100, detail: "Escudo leve. +1 defesa." },
  { id: "eq-shield", name: "Escudo de Torre", category: "shield", cost: 200, detail: "Escudo pesado. +2 defesa." },
  { id: "eq-cloak", name: "Manto Encantado", category: "accessory", cost: 150, detail: "Acessorio. Pequeno bonus de resistencia." },
]

export function getEquipment(id: string): EquipmentItem | undefined {
  return EQUIPMENT.find((e) => e.id === id)
}

export const STARTING_ZENIT = 500
export const STARTING_LEVEL = 5
export const BASE_MAX_IP = 6
export const BASE_HP = 40 // base de nivel 5 antes dos bonus de classe/MIG
export const BASE_MP = 20

// Sugestoes de essencia para inspirar o jogador
export const ORIGIN_SUGGESTIONS = [
  "As Ilhas Flutuantes de Aethel",
  "A Cidade-Relogio de Grivenholt",
  "O Deserto de Vidro do Sul",
  "A Floresta Sussurrante",
  "As Minas Profundas de Kaldrun",
]

export const IDENTITY_SUGGESTIONS = [
  "Pirata dos Ceus",
  "Cavaleiro Desonrado",
  "Aprendiz de Feiticeiro",
  "Cacador de Recompensas",
  "Nobre Exilado",
]

export const THEME_SUGGESTIONS = ["Esperanca", "Culpa", "Ambicao", "Vinganca", "Devocao", "Duvida"]

// Niveis de dificuldade padrao
export const DIFFICULTY_LEVELS = [
  { dl: 7, label: "Facil" },
  { dl: 10, label: "Normal" },
  { dl: 13, label: "Dificil" },
  { dl: 16, label: "Muito Dificil" },
]
