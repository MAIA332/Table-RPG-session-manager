import type { AttributeKey, DieSize, EquipmentItem } from "./types"
import type { Creature } from "./types"

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
    description: "Dois picos de excelência, com fraquezas.",
    dice: { dex: "d10", ins: "d10", mig: "d6", wlp: "d6" },
  },
]

export const ATTRIBUTE_META: Record<
  AttributeKey,
  { label: string; short: string; description: string }
> = {
  dex: { label: "Destreza", short: "DEX", description: "Agilidade e reflexos." },
  ins: { label: "Intuição", short: "INS", description: "Raciocínio e percepção mágica." },
  mig: { label: "Vigor", short: "MIG", description: "Força e resistência física." },
  wlp: { label: "Vontade", short: "WLP", description: "Carisma e determinação." },
}

export const DIE_ORDER: DieSize[] = ["d6", "d8", "d10", "d12"]

export interface GameSkill {
  id: string
  name: string
  maxLevel: number
  description: string
  action?: {
    cost: number
    resource: "mp" | "hp" | "ip"
  }
}

export interface GameClass {
  id: string
  name: string
  archetype: string
  description: string
  hpPerLevel: number
  mpPerLevel: number
  primaryAttribute: AttributeKey
  skills: GameSkill[]
}

// Adicione junto com suas outras exportações em lib/game-data.ts
export const CLASSES: GameClass[] = [
  {
    id: "darkblade",
    name: "Lâmina Sombria",
    archetype: "Vingador marcial",
    description: "Guerreiros poderosos que sacrificam a própria força vital para desferir ataques sombrios.",
    hpPerLevel: 5,
    mpPerLevel: 2,
    primaryAttribute: "mig",
    skills: [
      { id: "db-agony", name: "Agonia", maxLevel: 5, description: "Uma vez por turno, após causar dano a criaturas com as quais tem um Elo, você recupera PV e PM iguais a [Nível da Perícia x 2]." },
      { id: "db-darkblood", name: "Sangue Sombrio", maxLevel: 1, description: "Enquanto estiver em Crise, você possui Resistência a dano sombrio e a dano por veneno." },
      { id: "db-heart", name: "Coração das Trevas", maxLevel: 1, description: "Uma vez por cena, ao entrar em Crise, você pode criar um Elo de ódio com uma criatura que possa ver." },
      { id: "db-lesson", name: "Lição Dolorosa", maxLevel: 3, description: "Após sofrer dano, você pode realizar a ação Estudar nessa criatura gratuitamente com um bônus igual a [Nível da Perícia]." },
      { id: "db-shadowstrike", name: "Golpe Sombrio", maxLevel: 5, description: "Role seu dado de Vigor e perca esse valor em PV. Realize um ataque que causa [Nível da Perícia + dado de Vigor] de dano sombrio extra.", action: { cost: 5, resource: "hp" } },
    ],
  },
  {
    id: "rogue",
    name: "Ladino",
    archetype: "Agilidade e furtividade",
    description: "Criminosos, rebeldes ou espiões dispostos a jogar sujo para conseguir o que desejam.",
    hpPerLevel: 4,
    mpPerLevel: 3,
    primaryAttribute: "dex",
    skills: [
      { id: "ro-cheapshot", name: "Golpe Baixo", maxLevel: 5, description: "Causa [Nível da Perícia + quantidade de condições no alvo] de dano extra em inimigos com condições de status." },
      { id: "ro-dodge", name: "Esquiva", maxLevel: 3, description: "Sua Defesa é aumentada em [Nível da Perícia] desde que não use armaduras marciais ou escudos." },
      { id: "ro-highspeed", name: "Alta Velocidade", maxLevel: 3, description: "No início de um conflito, gaste 10 PM para agir antes da primeira rodada (Atacar, Atrapalhar ou Objetivo).", action: { cost: 10, resource: "mp" } },
      { id: "ro-seeyalater", name: "Até Mais", maxLevel: 1, description: "Gaste 1 Ponto de Fabula para desaparecer da cena e reaparecer em outra cena onde um aliado esteja." },
      { id: "ro-soulsteal", name: "Roubo de Alma", maxLevel: 5, description: "Teste [DES + VON] para roubar Pontos de Inventário ou um Tesouro de Alma em zênites de um alvo.", action: { cost: 0, resource: "mp" } },
    ],
  },
  {
    id: "spiritist",
    name: "Espiritista",
    archetype: "Curandeiro e Suporte",
    description: "Desenvolvem uma conexão poderosa com os aspectos mais puros da alma: emoção, energia, vida e morte.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "wlp",
    skills: [
      { id: "sp-healpower", name: "Poder de Cura", maxLevel: 2, description: "Magias que afetam aliados curam [3 + (Nível da Perícia x seus Elos)] PV adicionais se usar arma arcana." },
      { id: "sp-ritualism", name: "Ritualismo Espiritista", maxLevel: 1, description: "Você pode realizar Rituais da disciplina de Espiritualismo usando [INT + VON]." },
      { id: "sp-magic", name: "Magia Espiritual", maxLevel: 10, description: "Aprende magias como Cura, Barreira, Despertar e Lux. Cada nível concede um feitiço extra.", action: { cost: 10, resource: "mp" } },
      { id: "sp-support", name: "Magia de Suporte", maxLevel: 1, description: "Ao focar magias em aliados com Elos, concede um bônus no próximo Teste igual à força do Elo." },
      { id: "sp-bloodmage", name: "Vismago", maxLevel: 1, description: "Permite pagar custos de Pontos de Mente gastando o dobro do valor em Pontos de Vida." },
    ],
  },
  {
    id: "weaponmaster",
    name: "Mestre de Armas",
    archetype: "Guerreiro Marcial",
    description: "Guerreiros que passam anos e mais anos aperfeiçoando suas artes de combate corpo a corpo.",
    hpPerLevel: 5,
    mpPerLevel: 2,
    primaryAttribute: "mig",
    skills: [
      { id: "wm-bladestorm", name: "Tempestade de Lâminas", maxLevel: 5, description: "Gaste 10 PM para que seu ataque ganhe multi (2) ou adicione +1 alvo ao multi.", action: { cost: 10, resource: "mp" } },
      { id: "wm-bonecrusher", name: "Triturador de Ossos", maxLevel: 4, description: "Troque o dano do seu ataque por infligir atordoado, fraco ou drenar [Nível x 10] PM." },
      { id: "wm-breach", name: "Ruptura", maxLevel: 4, description: "Gaste 10 PM para atacar ignorando Resistências e causar [Nível x 5] de dano extra.", action: { cost: 10, resource: "mp" } },
      { id: "wm-counter", name: "Contra-ataque", maxLevel: 1, description: "Se o inimigo tirar um número par no teste de ataque contra você, você faz um ataque gratuito contra ele." },
      { id: "wm-mastery", name: "Mestria em Armas Corpo a Corpo", maxLevel: 4, description: "Você ganha um bônus igual a [Nível da Perícia] em todos os Testes de Precisão corporais." },
    ],
  },
  {
    id: "elementalist",
    name: "Elementalista",
    archetype: "Mago de Batalha",
    description: "Canaliza as almas que fluem nos elementos básicos da criação: Ar, Terra, Fogo e Gelo.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "ins",
    skills: [
      { id: "el-cataclysm", name: "Cataclismo", maxLevel: 3, description: "Aumente o custo do feitiço em até [Nível x 10] PM. Causa +5 de dano para cada 10 PM extras." },
      { id: "el-magic", name: "Magia Elemental", maxLevel: 10, description: "Aprende feitiços ofensivos como Labareda, Geada e Fulgor.", action: { cost: 10, resource: "mp" } },
      { id: "el-artillery", name: "Artilharia Mágica", maxLevel: 3, description: "Ganha [Nível x 2] de bônus em Testes de Magia se usar uma arma arcana." },
      { id: "el-ritual", name: "Ritual Elementalista", maxLevel: 1, description: "Você pode realizar Rituais para invocar chuvas, terremotos ou chamas usando [INT + POD]." },
      { id: "el-spellblade", name: "Espada Mágica", maxLevel: 4, description: "Lança feitiços canalizados na arma; o Teste de Magia se torna o Teste de Precisão da arma." },
    ],
  },
  {
    id: "guardian",
    name: "Guardião",
    archetype: "Tanque Protetor",
    description: "Altruístas dispostos a se sacrificar por uma pessoa, nação ou ideal.",
    hpPerLevel: 6,
    mpPerLevel: 2,
    primaryAttribute: "mig",
    skills: [
      { id: "gu-retaliation", name: "Retaliação", maxLevel: 1, description: "Se você defendeu um aliado no turno anterior, causa dano adicional no seu turno." },
      { id: "gu-mastery", name: "Mestria Defensiva", maxLevel: 5, description: "Reduz todo dano sofrido em [Nível da Perícia] se usar escudo ou armadura marcial." },
      { id: "gu-dualshield", name: "Portador de Dois Escudos", maxLevel: 1, description: "Permite usar dois escudos como uma arma dupla esmagadora." },
      { id: "gu-fortress", name: "Fortaleza", maxLevel: 4, description: "Aumenta seus Pontos de Vida máximos em [Nível da Perícia x 5]." },
      { id: "gu-protect", name: "Proteger", maxLevel: 1, description: "Intercepta um ataque, feitiço ou perigo direcionado a um aliado próximo." },
    ],
  },
  {
    id: "sharpshooter",
    name: "Franco-atirador",
    archetype: "Especialista à Distância",
    description: "Lidam com ameaças à distância com precisão calculada e armamentos letais.",
    hpPerLevel: 4,
    mpPerLevel: 3,
    primaryAttribute: "dex",
    skills: [
      { id: "sh-barrage", name: "Rajada", maxLevel: 1, description: "Gaste 10 PM para o ataque à distância ganhar multi (2) ou aumentar seu multi atual.", action: { cost: 10, resource: "mp" } },
      { id: "sh-crossfire", name: "Fogo Cruzado", maxLevel: 1, description: "Interrompe e cancela um ataque à distância inimigo gastando PM." },
      { id: "sh-eagle", name: "Olho de Águia", maxLevel: 5, description: "Após usar a ação Guarda, ganha ataques gratuitos ou ignora defesas inimigas no próximo tiro." },
      { id: "sh-mastery", name: "Mestria em Armas à Distância", maxLevel: 4, description: "Ganha [Nível da Perícia] de bônus em testes de Precisão com arcos e armas de fogo." },
      { id: "sh-warning", name: "Tiro de Advertência", maxLevel: 4, description: "Troque o dano do tiro para causar Abalado, Lento ou remover PM do alvo." },
    ],
  },
  {
    id: "orator",
    name: "Orador",
    archetype: "Líder e Diplomata",
    description: "Habilidosos em ler o coração das pessoas e reunir aliados para sua causa.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "wlp",
    skills: [
      { id: "or-condemn", name: "Condenar", maxLevel: 6, description: "Teste oposto de Int + Von. Causa perda de PM e deixa o alvo Abalado ou Atordoado.", action: { cost: 5, resource: "mp" } },
      { id: "or-encourage", name: "Encorajar", maxLevel: 6, description: "Restaura PV de um aliado e aumenta o tamanho do dado de um atributo dele.", action: { cost: 5, resource: "mp" } },
      { id: "or-trust", name: "Minha Confiança em Você", maxLevel: 2, description: "Gaste Ponto de Fabula para ajudar aliados; eles curam [Nível x 10] PM se vocês tiverem Elos." },
      { id: "or-persuasive", name: "Persuasivo", maxLevel: 2, description: "Gaste PM em testes sociais para avançar ou atrasar Relógios adicionais." },
      { id: "or-ally", name: "Aliado Inesperado", maxLevel: 1, description: "Gaste Ponto de Fabula para convencer um NPC neutro a ajudar a equipe." },
    ],
  },
  {
    id: "tinkerer",
    name: "Inventor",
    archetype: "Engenheiro Magitech",
    description: "Viajam pelo mundo buscando teorias perdidas e criam aparelhos excêntricos.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "ins",
    skills: [
      { id: "ti-emergency", name: "Item de Emergência", maxLevel: 1, description: "Uma vez por conflito, se estiver em Crise, você pode usar uma Ação de Inventário extra." },
      { id: "ti-gadgets", name: "Aparelhos", maxLevel: 5, description: "Desbloqueia projetos avançados de Magiesferas, Alquimia ou Armamento." },
      { id: "ti-potion", name: "Chuva de Poções", maxLevel: 2, description: "Ao criar poções, você pode gastar PM para afetar múltiplos alvos em área." },
      { id: "ti-formula", name: "Fórmula Secreta", maxLevel: 5, description: "Aumenta a eficácia das suas poções curativas ou bombas elementais." },
      { id: "ti-visionary", name: "Visionário", maxLevel: 5, description: "Ao criar Projetos, você economiza Zênites e agiliza o tempo de criação." },
    ],
  },
];

export function getClass(id: string): GameClass | undefined {
  return CLASSES.find((c) => c.id === id)
}

export const INVENTORY_ACTIONS = [
  { id: "inv-potion", name: "Remédio", cost: 3, description: "Recupera 50 Pontos de Vida (PV).", effectResource: "hp", effectValue: 50 },
  { id: "inv-elixir", name: "Elixir", cost: 3, description: "Recupera 50 Pontos de Mente (PM).", effectResource: "mp", effectValue: 50 },
  { id: "inv-tent", name: "Tenda Mágica", cost: 4, description: "Permite que o grupo descanse, recuperando tudo." },
]

export const EQUIPMENT: EquipmentItem[] = [
  { id: "eq-dagger", name: "Adaga de Aço", category: "weapon", cost: 150, purchasable: true, detail: "Arma Leve. Dano físico.\n[MODIFICADOR: Precisão usa DES + AST]" },
  { id: "eq-sword", name: "Espada de Bronze", category: "weapon", cost: 200, purchasable: true, detail: "Arma Marcial. Dano físico.\n[MODIFICADOR: Precisão usa DES + VIG]" },
  { id: "eq-greatsword", name: "Montante", category: "weapon", cost: 200, purchasable: true, detail: "Arma Pesada. Dano físico alto.\n[MODIFICADOR: Precisão usa DES + VIG]" },
  { id: "eq-bow", name: "Arco Curto", category: "weapon", cost: 200, purchasable: true, detail: "Arma à distância. Dano físico.\n[MODIFICADOR: Precisão usa DES + DES]" },
  { id: "eq-staff", name: "Cajado Arcano", category: "weapon", cost: 100, purchasable: true, detail: "Foco mágico. Dano mágico.\n[MODIFICADOR: Precisão usa VON + VON]" },
  { id: "eq-spear", name: "Lança Leve", category: "weapon", cost: 200, purchasable: true, detail: "Arma de Haste. Dano físico.\n[MODIFICADOR: Precisão usa DES + VIG]" },
  { id: "eq-travel", name: "Traje de Viagem", category: "armor", cost: 100, purchasable: true, detail: "Armadura Leve.\n[MODIFICADOR: Defesa = DES + 1]" },
  { id: "eq-brigandine", name: "Brigantina", category: "armor", cost: 150, purchasable: true, detail: "Armadura Marcial.\n[MODIFICADOR: Defesa fixa em 10]" },
  { id: "eq-plate", name: "Placa de Bronze", category: "armor", cost: 200, purchasable: true, detail: "Armadura Pesada. Reduz Inic.\n[MODIFICADOR: Defesa fixa em 11]" },
  { id: "eq-buckler", name: "Escudo de Bronze", category: "shield", cost: 100, purchasable: true, detail: "Escudo Leve.\n[MODIFICADOR: +2 Defesa]" },
  { id: "eq-shield", name: "Escudo Rúnico", category: "shield", cost: 150, purchasable: true, detail: "Escudo Marcial.\n[MODIFICADOR: +2 Defesa e DefM]" },
  
  // ITENS EXCLUSIVOS DO MESTRE (Não aparecem na loja)
  { id: "eq-excalibur", name: "Excalibur Maldita", category: "weapon", cost: 1000, purchasable: false, detail: "Artefato Ancião. Dano físico massivo.\n[MODIFICADOR: Precisão VIG + VIG, +5 Dano]" },
  { id: "eq-dragon-scale", name: "Escamas do Dragão", category: "armor", cost: 1500, purchasable: false, detail: "Armadura Lendária. Resistência a Fogo.\n[MODIFICADOR: Defesa fixa em 13]" },
]

export function getEquipment(id: string): EquipmentItem | undefined {
  return EQUIPMENT.find((e) => e.id === id)
}

export const STARTING_ZENIT = 500
export const STARTING_LEVEL = 5
export const BASE_MAX_IP = 6
export const BASE_HP = 40 
export const BASE_MP = 20

export const ORIGIN_SUGGESTIONS = [
  "As Ilhas Flutuantes de Aethel",
  "A Cidade-Relógio de Grivenholt",
  "O Deserto de Vidro do Sul",
  "As Minas de Ravenkhar",
  "A Floresta dos Druidas de Nova Gênese",
]

export const IDENTITY_SUGGESTIONS = [
  "Pirata dos Céus",
  "Cavaleiro Desonrado",
  "Erudito Exilado de Éliat",
  "Mercenário de Sinatra",
  "Guardião das Ruínas",
]

export const THEME_SUGGESTIONS = ["Esperança", "Culpa", "Ambição", "Vingança", "Devoção", "Dúvida", "Pertencimento"]

export const DIFFICULTY_LEVELS = [
  { dl: 7, label: "Fácil" },
  { dl: 10, label: "Normal" },
  { dl: 13, label: "Difícil" },
  { dl: 16, label: "Muito Difícil" },
]

export const BESTIARY: Creature[] = [
  {
    id: "cr-goblin",
    name: "Goblin Saqueador",
    imageUrl: "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=400&auto=format&fit=crop", // placeholder
    level: 5,
    species: "Humanóide",
    attributes: { dex: "d10", ins: "d8", mig: "d6", wlp: "d6" },
    maxHp: 30,
    maxMp: 10,
    def: 11,
    mdef: 9,
    affinities: { physical: "none", air: "none", bolt: "none", dark: "none", earth: "none", fire: "VU", ice: "none", light: "none", poison: "RS" },
    basicAttacks: [
      { name: "Adaga Enferrujada", attributes: ["dex", "mig"], damage: 4, type: "físico" }
    ],
    spells: ["Roubar Item: O Goblin rouba 10z de um alvo."]
  },
  {
    id: "cr-dragon",
    name: "Dragão Vermelho Ancião",
    imageUrl: "https://images.unsplash.com/photo-1577493341514-63cb53531fb5?q=80&w=400&auto=format&fit=crop", // placeholder
    level: 15,
    species: "Fera Mitológica",
    attributes: { dex: "d8", ins: "d8", mig: "d12", wlp: "d10" },
    maxHp: 120,
    maxMp: 40,
    def: 12,
    mdef: 10,
    affinities: { physical: "none", air: "none", bolt: "none", dark: "none", earth: "none", fire: "AB", ice: "VU", light: "none", poison: "IM" },
    basicAttacks: [
      { name: "Garras Dracônicas", attributes: ["mig", "mig"], damage: 10, type: "físico" },
      { name: "Sopro de Fogo", attributes: ["dex", "ins"], damage: 15, type: "fogo", description: "Atinge todos os inimigos na área." }
    ],
    spells: ["Rugido Aterrador: Gaste 10 PM. Todos os alvos fazem teste de VON. Se falharem, ficam Abalados."]
  }
]