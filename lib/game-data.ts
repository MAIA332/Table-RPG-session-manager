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
  dex: {
    label: "Destreza",
    short: "DEX",
    description: "Agilidade e reflexos.",
  },
  ins: {
    label: "Intuição",
    short: "INS",
    description: "Raciocínio e percepção mágica.",
  },
  mig: {
    label: "Vigor",
    short: "MIG",
    description: "Força e resistência física.",
  },
  wlp: {
    label: "Vontade",
    short: "WLP",
    description: "Carisma e determinação.",
  },
}

export const DIE_ORDER: DieSize[] = ["d6", "d8", "d10", "d12"]

export interface GameSkillBonus {
  id: string
  name: string
  description: string
}

export interface GameSkill {
  id: string
  name: string
  maxLevel: number
  description: string
  action?: {
    cost: number
    resource: "mp" | "hp" | "ip"
  }
  bonuses?: Record<number, GameSkillBonus[]>
}

export interface GameClass {
  /** Classes antigas continuam com IDs estáveis. Novas especializações são definidas pelo mestre. */
  parentClassId?: string
  id: string
  name: string
  archetype: string
  description: string
  hpPerLevel: number
  mpPerLevel: number
  primaryAttribute: AttributeKey
  skills: GameSkill[]
}

export const CLASSES: GameClass[] = [

  {
    id: "weaponmaster",
    name: "Mestre de Armas",
    archetype: "Guerreiro Marcial",
    description:
      "Guerreiros que passam anos e mais anos aperfeiçoando suas artes de combate corpo a corpo.",
    hpPerLevel: 5,
    mpPerLevel: 2,
    primaryAttribute: "mig",
    skills: [
      {
        id: "wm-bladestorm",
        name: "Tempestade de Lâminas",
        maxLevel: 5,
        description:
          "Gaste 10 PM para que seu ataque ganhe multi (2) ou adicione +1 alvo ao multi.",
        action: { cost: 10, resource: "mp" },
      },
      {
        id: "wm-bonecrusher",
        name: "Triturador de Ossos",
        maxLevel: 4,
        description:
          "Troque o dano do seu ataque por infligir atordoado, fraco ou drenar [Nível x 10] PM.",
      },
      {
        id: "wm-breach",
        name: "Ruptura",
        maxLevel: 4,
        description:
          "Gaste 10 PM para atacar ignorando Resistências e causar [Nível x 5] de dano extra.",
        action: { cost: 10, resource: "mp" },
      },
      {
        id: "wm-counter",
        name: "Contra-ataque",
        maxLevel: 1,
        description:
          "Se o inimigo tirar um número par no teste de ataque contra você, você faz um ataque gratuito contra ele.",
      },
      {
        id: "wm-mastery",
        name: "Mestria em Armas Corpo a Corpo",
        maxLevel: 4,
        description:
          "Você ganha um bônus igual a [Nível da Perícia] em todos os Testes de Precisão corporais.",
      },
    ],
  },
  {
    id: "orator",
    name: "Orador",
    archetype: "Líder e Diplomata",
    description:
      "Habilidosos em ler o coração das pessoas e reunir aliados para sua causa.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "wlp",
    skills: [
      {
        id: "or-condemn",
        name: "Condenar",
        maxLevel: 6,
        description:
          "Teste oposto de Int + Von. Causa perda de PM e deixa o alvo Abalado ou Atordoado.",
        action: { cost: 5, resource: "mp" },
      },
      {
        id: "or-encourage",
        name: "Encorajar",
        maxLevel: 6,
        description:
          "Restaura PV de um aliado e aumenta o tamanho do dado de um atributo dele.",
        action: { cost: 5, resource: "mp" },
      },
      {
        id: "or-trust",
        name: "Minha Confiança em Você",
        maxLevel: 2,
        description:
          "Gaste Ponto de Fabula para ajudar aliados; eles curam [Nível x 10] PM se vocês tiverem Elos.",
      },
      {
        id: "or-persuasive",
        name: "Persuasivo",
        maxLevel: 2,
        description:
          "Gaste [Nível da Perícia x 2] PM em testes sociais para convencer alguém.",
      },
      {
        id: "or-ally",
        name: "Aliado Inesperado",
        maxLevel: 1,
        description:
          "Gaste Ponto de Fabula para convencer um NPC neutro a ajudar a equipe.",
      },
    ],
  },
  {
    id: "tinkerer",
    name: "Inventor",
    archetype: "Engenheiro Magitech",
    description:
      "Viajam pelo mundo buscando teorias perdidas e criam aparelhos excêntricos.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "ins",
    skills: [
      {
        id: "ti-emergency",
        name: "Item de Emergência",
        maxLevel: 1,
        description:
          "Uma vez por conflito, se estiver em Crise, você pode usar uma Ação de Inventário extra.",
      },
      {
        id: "ti-gadgets",
        name: "Aparelhos",
        maxLevel: 5,
        description:
          "Desbloqueia projetos de construção nível [Nível da Perícia].",
      },
      {
        id: "ti-potion",
        name: "Chuva de Poções",
        maxLevel: 2,
        description:
          "Ao criar poções, você pode gastar PM para afetar múltiplos alvos em área.",
      },
      {
        id: "ti-formula",
        name: "Fórmula Secreta",
        maxLevel: 5,
        description:
          "Aumenta a eficácia das suas poções curativas ou bombas elementais.",
      },
      {
        id: "ti-visionary",
        name: "Visionário",
        maxLevel: 5,
        description:
          "Ao criar Projetos, você economiza Zênites e agiliza o tempo de criação.",
      },
    ],
  },
  {
    id: "chanter",
    name: "Cantor",
    archetype: "Músico Mágico",
    description:
      "Músicos excepcionais que dependem da força de suas almas para tecer magia em canções e apoiar os aliados no combate.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "wlp",
    skills: [
      {
        id: "ch-magisong",
        name: "Magicanção",
        maxLevel: 10,
        description:
          "Teca voz e música em um Verso mágico gastando PM (combina Volume, Clave e Tom).",
      },
      {
        id: "ch-resonance",
        name: "Ressonância",
        maxLevel: 3,
        description:
          "Após afetar inimigos com Versos, aliados causam [Nível] extra de dano, ou você recupera [Nível] PM ao feri-los.",
      },
      {
        id: "ch-siren",
        name: "Canção da Sereia",
        maxLevel: 1,
        description:
          "Gaste 10 PM para cantar em volume alto/médio permite criar ilusões auditivas em área para até [Nível x 5] alvos, essa habilidade usa WLP x [Nível x 2]. Alvos podem usar testes de foco e vontade para resistir.",
        action: { cost: 10, resource: "mp" },
      },
      {
        id: "ch-barrier",
        name: "Barreira Sonora",
        maxLevel: 5,
        description:
          "Após cantar com volume médio/alto, todo dano físico sofrido é reduzido em [Nível].",
      },
      {
        id: "ch-vibrato",
        name: "Vibrato",
        maxLevel: 1,
        description:
          "Após cantar em volume baixo/médio, você pode realizar um ataque gratuito ignorando sua RA.",
      },
    ],
  },
  {
    id: "loremaster",
    name: "Mestre do Conhecimento",
    archetype: "Sábio e Analista",
    description:
      "Possuem sede de descobertas implacável; eles trocariam todo o tesouro por um bom mistério encriptado.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "ins",
    skills: [
      {
        id: "lo-flash",
        name: "Flash de Intuição",
        maxLevel: 3,
        description:
          "Obtendo 15+ em investigações, faça [Nível x 1] perguntas gratuitas e objetivas ao Mestre sobre a cena especifica que se encontra e no tempo presente.",
          action: { cost: 5, resource: "mp" },
      },
      {
        id: "lo-focus",
        name: "Focado",
        maxLevel: 6,
        description:
          "Gaste 5 PM para aumentar seus PM totais em [Nível x 2]. Ganha bônus +2 ao realizar Testes Abertos de Intuição pura.",
        action: { cost: 5, resource: "mp" },
      },
      {
        id: "lo-knowledge",
        name: "Conhecimento é Poder",
        maxLevel: 1,
        description:
          "Permite usar a Intuição como parâmetro balístico no lugar do principal para Precisão.",
      },
      {
        id: "lo-assess",
        name: "Avaliação Rápida",
        maxLevel: 6,
        description:
          "Gaste [Nível x 5] PM no início do combate para ler Traços e Afinidades de todos os inimigos.",
      },
      {
        id: "lo-memory",
        name: "Memória Treinada",
        maxLevel: 1,
        description:
          "Gaste 15 PM para 'voltar no tempo' na própria mente para reviver investigações recentes da última semana, você pode realizar uma pergunta objetiva ao mestre sobre eventos passados em que você esteve inserido.",
        action: { cost: 15, resource: "mp" },
      },
    ],
  },
  {
    id: "mutant",
    name: "Mutante",
    archetype: "Abominação Adaptável",
    description:
      "Aqueles que suportaram experimentos severos. Alteram os ossos e fluídos do corpo para se adaptarem e sobreviver em combates extremos.",
    hpPerLevel: 6,
    mpPerLevel: 3,
    primaryAttribute: "mig",
    skills: [
      {
        id: "mu-akro",
        name: "Akromorfose",
        maxLevel: 3,
        description:
          "Seus punhos causam [6 + (Nível x 2)] extra e mudam de classe estrutural dinamicamente (Alcance/Corpo-a-corpo).",
      },
      {
        id: "mu-bio",
        name: "Biofagia",
        maxLevel: 4,
        description:
          "Ao infligir perda de PV em Crise, consuma o alvo e recupere [Nível x 5] PV de volta.",
      },
      {
        id: "mu-ecdysis",
        name: "Ecdise",
        maxLevel: 1,
        description:
          "Gaste 10 PV reativamente para criar resistência natural contra danos mágicos que te feriram.",
      },
      {
        id: "mu-geno",
        name: "Genoclépsis",
        maxLevel: 2,
        description:
          "Rouba a genética dos monstros inimigos momentaneamente concedendo Formas temporárias extras, essas formas se tornam Aspectos, declarar a utilização de um aspecto concede +2 em testes relacionados a ele e +5 de dano em ataques relacionados.",
      },
      {
        id: "mu-therio",
        name: "Theriomorfose",
        maxLevel: 6,
        description:
          "Custa 33% dos PVs: Manifesta até duas de suas evoluções mutantes devastadoras pela cena inteira.",
      },
    ],
  },
  {
    id: "cleric",
    name: "Clérigo",
    archetype: "Curandeiro Primário",
    description:
      "Servos devotos e guardiões da vida que utilizam os poderes da fé e compaixão para restaurar ferimentos e proteger aliados do fim iminente.",
    hpPerLevel: 4,
    mpPerLevel: 5,
    primaryAttribute: "wlp",
    skills: [
      {
        id: "cl-aura",
        name: "Aura Curativa",
        maxLevel: 5,
        description:
          "Sempre que restaurar os PV de um ou mais aliados através de magias, eles recuperam [Nível da Perícia x 2] PV adicionais.",
      },
      {
        id: "cl-purify",
        name: "Mãos Purificadoras",
        maxLevel: 3,
        description:
          "Ao tirar 13+ em testes de Medicina em um aliado, você pode curar [Nível da Perícia x 2] PV adicionais e remover até [Nível da Perícia] condições de status negativas dele sem nenhum custo de PM adicional.",
      },
      {
        id: "cl-sanctuary",
        name: "Santuário",
        maxLevel: 4,
        description:
          "Enquanto você não estiver em Crise, você e os aliados com os quais tem um Elo recuperam [Nível da Perícia x 5] PV automaticamente no início do seu turno.",
      },
      {
        id: "cl-breath",
        name: "Sopro de Vida",
        maxLevel: 1,
        description:
          "Uma vez por cena, se um aliado for reduzido a 0 PV, você pode gastar 25 PM como uma reação imediata (você deve tirar 5+ em um teste de reflexo) para evitar que ele caia, restaurando-o com metade dos PV máximos dele.",
        action: { cost: 25, resource: "mp" },
      },
      {
        id: "cl-martyr",
        name: "Martírio Compassivo",
        maxLevel: 5,
        description:
          "Gaste uma ação para perder voluntariamente até [Nível x 10] PV (este dano não pode ser reduzido). Distribua o dobro do valor perdido como cura de PV entre qualquer número de aliados que você possa ver.",
        action: { cost: 0, resource: "hp" },
      },
    ],
  },
  {
    id: "monk",
    name: "Monge",
    archetype: "Artista Marcial",
    description:
      "Lutadores disciplinados que dispensam armamentos, canalizando sua própria energia vital (Ki) para transcender os limites do corpo físico.",
    hpPerLevel: 5,
    mpPerLevel: 3,
    primaryAttribute: "dex",
    skills: [
      {
        id: "mk-ironfist",
        name: "Punhos de Ferro",
        maxLevel: 5,
        description:
          "Seus ataques desarmados passam a ser considerados armas da categoria Briga. Eles causam [Nível da Perícia x 2] de dano físico extra.",
      },
      {
        id: "mk-chakra",
        name: "Chakra",
        maxLevel: 4,
        description:
          "Gaste uma cena ou rodada para canalizar seu Ki. Você cura Nível x 10: [Nível x 10] PV e pode remover todas as condições negativas de si mesmo.",
        action: { cost: 20, resource: "mp" },
      },
      {
        id: "mk-flurry",
        name: "Rajada de Golpes",
        maxLevel: 3,
        description:
          "Gaste 10 PM. Ao realizar um ataque desarmado, você ataca duas vezes. O segundo ataque causa metade do dano normal e não aplica efeitos adicionais.",
        action: { cost: 10, resource: "mp" },
      },
      {
        id: "mk-windstep",
        name: "Passo do Vento",
        maxLevel: 1,
        description:
          "Enquanto não estiver vestindo armaduras marciais ou escudos, você ganha Resistência a dano de ataques à distância.",
      },
      {
        id: "mk-flow",
        name: "Fluxo Contínuo",
        maxLevel: 5,
        description:
          "Sempre que você acerta um ataque crítico ou reduz um inimigo a 0 PV, você recupera [Nível da Perícia x 3] Pontos de Mente.",
      },
    ],
  },
  {
    id: "ninja",
    name: "Ninja",
    archetype: "Assassino das Sombras",
    description:
      "Especialistas em espionagem, combinam agilidade extrema, lâminas ocultas e artes místicas ilusionistas (Ninjutsu) para abater seus inimigos.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "dex",
    skills: [
      {
        id: "nj-ninjutsu",
        name: "Ninjutsu",
        maxLevel: 5,
        description:
          "Desbloqueia pergaminhos ninja elementais. Você pode realizar Rituais de ilusão, movimento e fumaça rapidamente rolando [DES + INT].",
      },
      {
        id: "nj-ambush",
        name: "Ataque Surpresa",
        maxLevel: 5,
        description:
          "Você causa [Nível da Perícia x 4] de dano extra contra inimigos que ainda não agiram na primeira rodada do combate.",
      },
      {
        id: "nj-clone",
        name: "Clone das Sombras",
        maxLevel: 3,
        description:
          "Gaste 15 PM como uma ação livre. O próximo ataque ou feitiço de alvo único que atingiria você automaticamente erra e destrói o clone.",
        action: { cost: 15, resource: "mp" },
      },
      {
        id: "nj-dualwield",
        name: "Lâminas Gêmeas",
        maxLevel: 1,
        description:
          "Permite empunhar duas armas da categoria Adaga ou Espada de uma mão simultaneamente, ganhando +[Nível da Perícia x 2] em ataques básicos usando laminas mas perdendo seu bônus de escudo.",
      },
      {
        id: "nj-shuriken",
        name: "Chuva de Estrelas",
        maxLevel: 4,
        description:
          "Quando usar a ação Atacar com uma arma de arremesso, gaste 5 PM para atingir [Nível da Perícia] alvos adicionais com metade do dano.",
        action: { cost: 5, resource: "mp" },
      },
    ],
  },
  {
    id: "geomancer",
    name: "Geomante",
    archetype: "Mago do Terreno",
    description:
      "Sintonizam-se com as linhas de força da própria terra, alterando o campo de batalha para subjugar inimigos e extrair magia do ambiente.",
    hpPerLevel: 4,
    mpPerLevel: 5,
    primaryAttribute: "ins",
    skills: [
      {
        id: "ge-leyline",
        name: "Linhas de Ley",
        maxLevel: 5,
        description:
          "Gaste 10 PM. Altere a afinidade de uma zona do campo. Magias lançadas por você dessa afinidade causam [Nível x 3] de dano extra até o fim da cena.",
        action: { cost: 10, resource: "mp" },
      },
      {
        id: "ge-prison",
        name: "Prisão de Terra",
        maxLevel: 3,
        description:
          "Força o terreno a prender o inimigo. O alvo rola [MIG + DES]; falhas infligem a condição Lento e vulnerabilidade a ataques físicos por [Nível] rodadas.",
        action: { cost: 10, resource: "mp" },
      },
      {
        id: "ge-seismic",
        name: "Sentido Sísmico",
        maxLevel: 1,
        description:
          "Enquanto seus pés tocarem a terra firme ou pedra, você nunca pode ser pego de surpresa e ignora penalidades para atingir alvos invisíveis.",
      },
      {
        id: "ge-absorb",
        name: "Absorção Ambiental",
        maxLevel: 4,
        description:
          "Uma vez por turno, se você ou um aliado receber dano elemental correspondente ao ambiente (ex: fogo num vulcão), o dano é reduzido em [Nível x 5].",
      },
      {
        id: "ge-nature",
        name: "Revolta da Natureza",
        maxLevel: 3,
        description:
          "Transforma o bioma ao seu favor. Ganhe +[Nível] na Defesa em florestas ou pântanos, +[Nível] na Defesa Mágica em cavernas, ou +[Nível] de Atletismo ou Precisão em planícies.",
      },
    ],
  },
  {
    id: "hemomancer",
    name: "Hemomante",
    archetype: "Mago de Sangue",
    description:
      "Magos que transformam o próprio sangue em combustível arcano, sacrificando a própria vitalidade para produzir efeitos sobrenaturais devastadores.",
    hpPerLevel: 4,
    mpPerLevel: 5,
    primaryAttribute: "wlp",
    skills: [
      {
        id: "he-bloodfuel",
        name: "Sangue como Combustível",
        maxLevel: 5,
        description:
          "Ao lançar uma magia, você pode pagar até [Nível da Perícia x 2] PM usando PV. Cada 2 PV gastos reduz o custo da magia em 1 PM.",
      },
      {
        id: "he-coagulation",
        name: "Coagulação",
        maxLevel: 4,
        description:
          "Gaste 5 PM e 3 PV (seu ou dos seus aliados) para criar uma barreira de sangue que absorve [Nível da Perícia x 8] de dano até o início do seu próximo turno.",
        action: { cost: 5, resource: "mp" },
      },
      {
        id: "he-transfusion",
        name: "Transfusão",
        maxLevel: 5,
        description:
          "Gaste uma ação e até [Nível da Perícia x 5] PV para curar um aliado. Para cada 2 PV sacrificados, o alvo recupera 3 PV.",
      },
      {
        id: "he-hemorrhage",
        name: "Hemorragia",
        maxLevel: 5,
        description:
          "Uma vez por turno, quando causar dano com um ataque ou magia, você pode gastar 5 PM para aplicar Sangramento. Alvos Sangrando sofrem [Nível da Perícia] de dano adicional sempre que sofrerem dano físico.",
      },
      {
        id: "he-redheart",
        name: "Coração Vermelho",
        maxLevel: 1,
        description:
          "Enquanto estiver em Crise, suas magias custam 5 PM a menos, mínimo 1 PM. Sempre que usar esse benefício, você perde 5 PV após a magia.",
      },
    ],
  },

  {
    id: "prophet",
    name: "Profeta",
    archetype: "Vidente do Futuro",
    description:
      "Místicos capazes de enxergar fragmentos do futuro e manipular acontecimentos através de presságios e previsões.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "ins",
    skills: [
      {
        id: "pr-omens",
        name: "Presságios",
        maxLevel: 5,
        description:
          "No início de uma cena, receba [Nível da Perícia] Presságios. Gaste 1 Presságio para adicionar +2 a uma rolagem sua ou de um aliado.",
      },
      {
        id: "pr-premonition",
        name: "Premonição",
        maxLevel: 5,
        description:
          "Gaste 5 PM para receber +[Nível da Perícia] em Defesa ou Defesa Mágica contra o próximo ataque de uma criatura que você possa ver.",
        action: { cost: 5, resource: "mp" },
      },
      {
        id: "pr-vision",
        name: "Visão Fragmentada",
        maxLevel: 3,
        description:
          "Gaste 10 PM para fazer ao Mestre uma pergunta sobre algo que provavelmente acontecerá nos próximos minutos. A resposta pode ser simbólica ou incompleta.",
        action: { cost: 10, resource: "mp" },
      },
      {
        id: "pr-warning",
        name: "Eu Avisei",
        maxLevel: 4,
        description:
          "Quando um aliado falhar em um teste que você possa perceber, gaste 5 PM para permitir que ele repita a rolagem. O novo resultado deve ser usado.",
      },
      {
        id: "pr-apocalypse",
        name: "Apocalipse Anunciado",
        maxLevel: 1,
        description:
          "Uma vez por cena, declare um acontecimento futuro plausível. O Mestre deve incorporá-lo à narrativa, mas pode determinar uma consequência ou custo significativo.",
      },
    ],
  },

  {
    id: "exorcist",
    name: "Exorcista",
    archetype: "Caçador de Entidades",
    description:
      "Especialistas em enfrentar possessões, maldições e criaturas sobrenaturais que não pertencem ao mundo material.",
    hpPerLevel: 5,
    mpPerLevel: 3,
    primaryAttribute: "wlp",
    skills: [
      {
        id: "ex-mark",
        name: "Marca Profana",
        maxLevel: 5,
        description:
          "Ao atingir uma criatura sobrenatural, você pode marcá-la por [Nível da Perícia] rodadas. Você recebe +[Nível da Perícia] em Testes de Precisão e Magia contra ela.",
      },
      {
        id: "ex-banishing",
        name: "Banimento",
        maxLevel: 5,
        description:
          "Gaste 10 PM ao acertar uma criatura marcada para ignorar até [Nível da Perícia x 2] pontos de Resistência sobrenatural nesse ataque.",
        action: { cost: 10, resource: "mp" },
      },
      {
        id: "ex-seal",
        name: "Selo de Contenção",
        maxLevel: 4,
        description:
          "Gaste 10 PM para selar temporariamente uma habilidade sobrenatural de uma criatura marcada. O alvo pode realizar um teste de VON para resistir.",
        action: { cost: 10, resource: "mp" },
      },
      {
        id: "ex-purification",
        name: "Purificação",
        maxLevel: 5,
        description:
          "Gaste 5 PM para remover [Nível da Perícia] condições sobrenaturais de uma criatura ou reduzir uma possessão, corrupção ou maldição em um estágio.",
      },
      {
        id: "ex-you-dont-belong",
        name: "Você Não Pertence Aqui",
        maxLevel: 1,
        description:
          "Uma vez por cena, uma entidade sobrenatural marcada deve realizar um Teste de VON. Em caso de falha, ela é expulsa temporariamente de seu hospedeiro ou perde suas habilidades sobrenaturais por 1 rodada.",
      },
    ],
  },

  {
    id: "puppeteer",
    name: "Marionetista",
    archetype: "Mestre dos Fios",
    description:
      "Controladores sobrenaturais que conectam fios espirituais a criaturas e objetos, transformando o campo de batalha em um palco.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "ins",
    skills: [
      {
        id: "pu-thread",
        name: "Fio Espiritual",
        maxLevel: 5,
        description:
          "Gaste 5 PM para conectar um Fio a uma criatura que você possa ver. Você pode manter [Nível da Perícia] Fios simultaneamente.",
      },
      {
        id: "pu-pull",
        name: "Puxar",
        maxLevel: 5,
        description:
          "Enquanto possuir um Fio conectado, gaste 5 PM para mover o alvo até [Nível da Perícia x 2] metros, se ele falhar em um teste de MIG ou DES.",
      },
      {
        id: "pu-hands",
        name: "Mãos Invisíveis",
        maxLevel: 4,
        description:
          "Gaste 5 PM para manipular remotamente um objeto conectado ou realizar uma tarefa física simples através de um Fio.",
      },
      {
        id: "pu-dance",
        name: "Dançar Conforme Minha Música",
        maxLevel: 4,
        description:
          "Gaste 10 PM. Uma criatura conectada deve realizar um movimento ou ação simples escolhida por você caso falhe em um Teste de VON.",
        action: { cost: 10, resource: "mp" },
      },
      {
        id: "pu-master",
        name: "Mestre das Marionetes",
        maxLevel: 1,
        description:
          "Uma vez por cena, gaste 20 PM para controlar parcialmente uma criatura conectada durante uma rodada. A criatura recebe um novo Teste de VON no final da rodada.",
        action: { cost: 20, resource: "mp" },
      },
    ],
  },

  {
    id: "predator",
    name: "Predador",
    archetype: "Caçador Apex",
    description:
      "Caçadores especializados em estudar uma presa, descobrir suas fraquezas e transformar cada confronto em uma execução planejada.",
    hpPerLevel: 5,
    mpPerLevel: 3,
    primaryAttribute: "ins",
    skills: [
      {
        id: "prx-prey",
        name: "Presa",
        maxLevel: 1,
        description:
          "No início de uma cena, escolha um alvo como sua Presa. Você recebe +[Nível da Perícia x 2] em testes de percepção, investigação e sobrevivência contra ela.",
      },
      {
        id: "prx-track",
        name: "Rastrear Presa",
        maxLevel: 5,
        description:
          "Após estudar uma Presa alvo que possua, você recebe +[Nível da Perícia x 2] em testes ofensivos contra ela.",
      },
      {
        id: "prx-weakness",
        name: "Conhecer Fraqueza",
        maxLevel: 5,
        description:
          "Após estudar sua Presa, seus ataques contra ela ignoram [Nível da Perícia] pontos de Resistência.",
      },
      {
        id: "prx-killer",
        name: "Golpe Mortal",
        maxLevel: 4,
        description:
          "Contra sua Presa, seus ataques causam [Nível da Perícia x 2] de dano extra quando ela estiver abaixo de metade dos PV.",
      },
      {
        id: "prx-trophy",
        name: "Caçador de Monstros",
        maxLevel: 1,
        description:
          "Ao derrotar uma criatura especial, escolha uma característica dela. Uma vez por cena futura, você pode manifestar uma versão limitada dessa característica durante 1 rodada.",
      },
    ],
  },

  {
    id: "parasite",
    name: "Parasita",
    archetype: "Simbionte Monstruoso",
    description:
      "Hospedeiros de organismos sobrenaturais que vivem dentro de seus corpos e concedem mutações poderosas em troca de influência crescente.",
    hpPerLevel: 6,
    mpPerLevel: 3,
    primaryAttribute: "mig",
    skills: [
      {
        id: "pa-mutation",
        name: "Mutação",
        maxLevel: 5,

        description:
          "Gaste 10 PM e escolha uma Mutação. Cada Mutação concede um bônus em testes relacionados às suas características. Você pode trocar sua Mutação após um descanso.",

        bonuses: {
          1: [
            {
              id: "bone-armor",
              name: "Armadura Óssea",
              description:
                "Seu corpo desenvolve placas e estruturas ósseas protetoras. Receba +3 em seu dado de destreza para defesa, impacto ou efeitos que exijam resistência corporal.",
            },
            {
              id: "claws",
              name: "Garras",
              description:
                "Suas mãos ou pés desenvolvem garras afiadas. Receba +2 em testes de ataque, escalada e ações que dependam de força física ou precisão corporal.",
            },
            {
              id: "tentacles",
              name: "Tentáculos",
              description:
                "Você desenvolve tentáculos capazes de agarrar e manipular objetos. Receba +2 em testes de Imobilização, precisão e destreza para manipular algo à distância.",
            },
            {
              id: "extra-eye",
              name: "Olho Extra",
              description:
                "Um olho adicional surge em seu corpo, ampliando sua percepção. Receba +2 em testes de Percepção, investigação visual e para detectar criaturas ou objetos ocultos.",
            },
            {
              id: "poison",
              name: "Veneno",
              description:
                "Seu corpo produz uma toxina que pode ser aplicada através de seus ataques. Receba +2 em testes para envenenar, contaminar ou resistir a substâncias tóxicas.",
            },
            {
              id: "regeneration",
              name: "Regeneração",
              description:
                "Seu corpo se recupera de ferimentos com velocidade anormal. Receba +2 em testes para resistir a sangramento, exaustão, dor e efeitos que prejudiquem seu corpo.",
            },
          ],

          2: [
            {
              id: "bone-armor",
              name: "Armadura Óssea — Fortificação",
              description:
                "O bônus da Armadura Óssea aumenta para +3 em testes de resistência física.",
            },
            {
              id: "claws",
              name: "Garras — Predador",
              description:
                "O bônus das Garras aumenta para +3 em testes de ataque e ações físicas que dependam de precisão ou força.",
            },
            {
              id: "tentacles",
              name: "Tentáculos — Controle",
              description:
                "O bônus dos Tentáculos aumenta para +3 em testes de agarrar, imobilizar e manipular objetos.",
            },
            {
              id: "extra-eye",
              name: "Olho Extra — Percepção Aguçada",
              description:
                "O bônus do Olho Extra aumenta para +3 em testes de Percepção e investigação visual.",
            },
            {
              id: "poison",
              name: "Veneno — Toxina Potente",
              description:
                "O bônus do Veneno aumenta para +3 em testes relacionados a venenos e toxinas.",
            },
            {
              id: "regeneration",
              name: "Regeneração — Recuperação",
              description:
                "O bônus da Regeneração aumenta para +3 em testes para resistir a dor, exaustão, sangramento e ferimentos.",
            },
          ],

          3: [
            {
              id: "bone-armor",
              name: "Armadura Óssea — Carapaça",
              description:
                "Receba +4 em testes de resistência física. Além disso, você recebe vantagem em testes para resistir a impactos violentos.",
            },
            {
              id: "claws",
              name: "Garras — Carnificina",
              description:
                "Receba +4 em testes de ataque usando suas garras e em testes para causar ou manter ferimentos físicos.",
            },
            {
              id: "tentacles",
              name: "Tentáculos — Dominação",
              description:
                "Receba +4 em testes de agarrar e imobilizar. Você também pode realizar manipulações complexas usando seus tentáculos.",
            },
            {
              id: "extra-eye",
              name: "Olho Extra — Sentidos Sobrenaturais",
              description:
                "Receba +4 em testes de Percepção. Você pode perceber detalhes que normalmente seriam difíceis de enxergar.",
            },
            {
              id: "poison",
              name: "Veneno — Toxina Persistente",
              description:
                "Receba +4 em testes relacionados ao Veneno. Seus efeitos tóxicos também são mais difíceis de neutralizar.",
            },
            {
              id: "regeneration",
              name: "Regeneração — Regeneração Acelerada",
              description:
                "Receba +4 em testes para resistir a ferimentos, dor e exaustão. Você também pode tentar resistir a condições físicas incapacitantes.",
            },
          ],

          4: [
            {
              id: "bone-armor",
              name: "Armadura Óssea — Fortaleza Viva",
              description:
                "Receba +5 em testes de resistência física e vantagem para resistir a impactos, fraturas e efeitos que tentem derrubar ou deslocar você.",
            },
            {
              id: "claws",
              name: "Garras — Caçador Perfeito",
              description:
                "Receba +5 em testes de ataque e perseguição que utilizem suas garras ou capacidades físicas predatórias.",
            },
            {
              id: "tentacles",
              name: "Tentáculos — Múltiplos Membros",
              description:
                "Receba +5 em testes de agarrar, imobilizar e manipular objetos. Você pode executar múltiplas ações de manipulação simultaneamente.",
            },
            {
              id: "extra-eye",
              name: "Olho Extra — Visão Absoluta",
              description:
                "Receba +5 em testes de Percepção e investigação visual. Você recebe vantagem para perceber criaturas escondidas ou detalhes sutis.",
            },
            {
              id: "poison",
              name: "Veneno — Toxina Letal",
              description:
                "Receba +5 em testes relacionados ao Veneno. Criaturas afetadas têm maior dificuldade para resistir ou remover seus efeitos.",
            },
            {
              id: "regeneration",
              name: "Regeneração — Corpo Imortal",
              description:
                "Receba +5 em testes para resistir a ferimentos, dor, exaustão e condições físicas debilitantes.",
            },
          ],

          5: [
            {
              id: "bone-armor",
              name: "Armadura Óssea — Forma Colossal",
              description:
                "Sua estrutura óssea se torna extremamente resistente. Receba +6 em testes de resistência física e vantagem para resistir a qualquer efeito baseado em força ou impacto.",
            },
            {
              id: "claws",
              name: "Garras — Predador Supremo",
              description:
                "Suas garras tornam-se armas naturais perfeitas. Receba +6 em testes de ataque, perseguição e ações físicas predatórias.",
            },
            {
              id: "tentacles",
              name: "Tentáculos — Aberração Perfeita",
              description:
                "Seus tentáculos possuem força e coordenação excepcionais. Receba +6 em testes de agarrar, imobilizar e manipulação.",
            },
            {
              id: "extra-eye",
              name: "Olho Extra — Percepção Total",
              description:
                "Seu olho adicional percebe o mundo de maneira extraordinária. Receba +6 em testes de Percepção e investigação e vantagem contra tentativas de ocultação.",
            },
            {
              id: "poison",
              name: "Veneno — Toxina Primordial",
              description:
                "Seu corpo produz um veneno extremamente poderoso. Receba +6 em testes relacionados a toxinas e vantagem para aplicar ou resistir aos efeitos de venenos.",
            },
            {
              id: "regeneration",
              name: "Regeneração — Regeneração Monstruosa",
              description:
                "Seu corpo desafia os limites da biologia. Receba +6 em testes para resistir a ferimentos, dor, exaustão e condições físicas debilitantes.",
            },
          ],
        },
        action: {
          cost: 10,
          resource: "mp",
        },
      },
      {
        id: "pa-instinct",
        name: "Instinto do Parasita",
        maxLevel: 4,
        description:
          "Quando estiver em Crise, recebe +[Nível da Perícia] em testes físicos e seus ataques causam [Nível da Perícia] de dano extra.",
      },
      {
        id: "pa-symbiosis",
        name: "Simbiose",
        maxLevel: 5,
        description:
          "Ative esta Perícia gastando 10 PM para ativar um modificador em uma Mutação que possua durante um cena livre ou 3 rodadas, recupera após descanso curto. Ao ativá-la, escolha uma das opções de Simbiose disponíveis para o seu nível. A Mutação escolhida recebe o bônus até o fim da cena.",
        action: {
          cost: 10,
          resource: "mp",
        },

        bonuses: {
          1: [
            {
              id: "simbiose-potencia",
              name: "Potência",
              description:
                "Aumente em +2 o dano ou em +2 testes relacionados a Mutação.",
            },
            {
              id: "simbiose-eficiency",
              name: "Eficiência",
              description:
                "Reduza em 2 PM o próximo custo de ativação ou manutenção da Mutação.",
            },
          ],

          2: [
            {
              id: "simbiose-potencia-upgraded",
              name: "Potência Aprimorada",
              description:
                "Aumente em +3 o dano ou em +3 testes relacionados a Mutação.",
            },
            {
              id: "simbiose-alcance",
              name: "Alcance",
              description: "Receba +3 em testes de precisão da Mutação.",
            },
            {
              id: "simbiose-duracao",
              name: "Duração",
              description: "Aumente a duração da Mutação em +1 rodada.",
            },
          ],

          3: [
            {
              id: "simbiose-intensufy",
              name: "Intensidade",
              description:
                "Aumente em +4 o dano ou +4 em testes relacionados á Mutação.",
            },
            {
              id: "simbiose-penetration",
              name: "Penetração",
              description:
                "Ignore 2 pontos de Resistência, Defesa ou redução de dano aplicável à Mutação.",
            },
            {
              id: "simbiose-versatility",
              name: "Versatilidade",
              description:
                "Escolha um segundo alvo válido para a Mutação, se ela normalmente afetar apenas um, o segundo alvo recebe metade do dano que seria causado ao primeiro alvo.",
            },
          ],

          4: [
            {
              id: "simbiose-exalt",
              name: "Exaltação",
              description:
                "Aumente em +5 o dano ou +5 em testes relacionados á Mutação.",
            },
            {
              id: "simbiose-sustain",
              name: "Sustentação",
              description:
                "A Mutação não exige manutenção durante esta cena podendo ser trocada sem custo adicional ou descanso.",
            },
            {
              id: "simbiose-transmutaation",
              name: "Transmutação",
              description:
                "Adapte a Mutação para alterar seu tipo de dano ou efeito para outro tipo apropriado.",
            },
          ],
        },
      },
      {
        id: "pa-regeneration",
        name: "Regeneração",
        maxLevel: 4,
        description:
          "Uma vez por turno, quando estiver abaixo da metade dos PV, você pode gastar 5 PM para recuperar [Nível da Perícia x 3] PV.",
      },
      {
        id: "pa-monster",
        name: "Forma Monstruosa",
        maxLevel: 1,
        description:
          "Uma vez por cena, gaste 20 PM para assumir sua forma monstruosa por 3 rodadas ou uma cena livre. Você recebe +2 de Precisão, +2 de Defesa e causa +10 de dano em ataques físicos. Ao terminar, fica Enfraquecido.",
        action: { cost: 20, resource: "mp" },
      },
    ],
  },
]

export function getClass(id: string): GameClass | undefined {
  return CLASSES.find((c) => c.id === id)
}

export const INVENTORY_ACTIONS = []

export const EQUIPMENT: EquipmentItem[] = [
  {
    id: "eq-dagger",
    weight: 300,
    weightUnit: "g",
    name: "Adaga de Aço",
    category: "weapon",
    cost: 150,
    purchasable: true,
    detail:
      "Arma Leve (Adaga). Dano físico. Fácil de ocultar e rápida de sacar.\n[BÔNUS: Nenhum]\n[MODIFICADOR: Precisão usa DES + INS]",
  },

  {
    id: "eq-knuckles",
    weight: 600,
    weightUnit: "g",
    name: "Manoplas de Ferro",
    category: "weapon",
    cost: 150,
    purchasable: true,
    detail:
      "Arma Leve (Briga). Não ocupa as mãos para itens. Permite lutar mantendo as mãos parcialmente livres.\n[BÔNUS: Não ocupa as mãos para itens; +1 em testes de Briga quando desarmado]\n[MODIFICADOR: Precisão usa DES + VIG]",
  },

  {
    id: "eq-sword",
    weight: 1200,
    weightUnit: "g",
    name: "Espada de Bronze",
    category: "weapon",
    cost: 200,
    purchasable: true,
    detail:
      "Arma Marcial (Espada de 1 Mão). Uma arma equilibrada para combate ofensivo e defensivo.\n[BÔNUS: Nenhum]\n[MODIFICADOR: Precisão usa DES + VIG]",
  },

  {
    id: "eq-greatsword",
    weight: 3000,
    weightUnit: "g",
    name: "Montante",
    category: "weapon",
    cost: 300,
    purchasable: true,
    detail:
      "Arma Pesada (Espada de 2 Mãos). Uma lâmina enorme capaz de produzir golpes devastadores.\n[BÔNUS: +2 Dano físico; -1 em Iniciativa]\n[MODIFICADOR: Precisão usa DES + VIG]",
  },

  {
    id: "eq-battleaxe",
    weight: 1800,
    weightUnit: "g",
    name: "Machado de Batalha",
    category: "weapon",
    cost: 250,
    purchasable: true,
    detail:
      "Arma Pesada (1 Mão). Lenta, porém brutal. Pode ser utilizada com escudo.\n[BÔNUS: +1 Dano físico]\n[MODIFICADOR: Precisão usa VIG + VIG]",
  },

  {
    id: "eq-lantern",
    weight: 700,
    weightUnit: "g",
    name: "Lamparina",
    category: "accessory",
    cost: 50,
    purchasable: true,
    detail:
      "Fonte de luz confiável movida a óleo. Essencial para explorar cavernas obscuras.\n[BÔNUS: Permite enxergar em áreas escuras; não concede bônus direto de combate]",
  },

  {
    id: "eq-ruby-ring",
    weight: 15,
    weightUnit: "g",
    name: "Anel de Rubi",
    category: "accessory",
    cost: 300,
    purchasable: true,
    detail:
      "Joia incandescente que retém uma pequena quantidade de energia elemental.\n[BÔNUS: Resistência a dano de Fogo]",
  },

  // ==========================================================
  // ITENS NARRATIVOS — MORTE MÁGICA
  // ==========================================================

  {
    id: "eq-ravenkhar-pendant",
    weight: 30,
    weightUnit: "g",
    name: "Colar de Ravenkhar",
    category: "accessory",
    cost: 40,
    purchasable: false,
    detail:
      "Pequeno círculo de madeira atravessado por um X. Artesanato tradicional encontrado em comunidades de Ravenkhar.\n[BÔNUS: Nenhum]\n[LORE: O símbolo pode ser reconhecido por comerciantes familiarizados com Ravenkhar. Não possui função mágica conhecida.]",
  },
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

export const THEME_SUGGESTIONS = [
  "Esperança",
  "Culpa",
  "Ambição",
  "Vingança",
  "Devoção",
  "Dúvida",
  "Pertencimento",
]

export const DIFFICULTY_LEVELS = [
  { dl: 7, label: "Fácil" },
  { dl: 10, label: "Normal" },
  { dl: 13, label: "Difícil" },
  { dl: 16, label: "Muito Difícil" },
]

export const BESTIARY: Creature[] = [
  {
    id: "cr-wolf",
    name: "Lobo Zumbi",
    imageUrl:
      "https://preview.redd.it/the-zombie-virus-spread-to-wildlife-ex-wolves-birds-bears-v0-ry0uc5mpm82c1.jpg?width=640&crop=smart&auto=webp&s=593110ee26508e4e81b5bcd3bb56ddc2112a549a",
    level: 10,
    species: "Besta",
    attributes: { dex: "d10", ins: "d8", mig: "d8", wlp: "d6" },
    maxHp: 50,
    maxMp: 20,
    def: 11,
    mdef: 8,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "none",
      ice: "RS",
      light: "none",
      poison: "none",
    },
    basicAttacks: [
      {
        name: "Mordida Feroz",
        attributes: ["dex", "mig"],
        damage: 8,
        type: "físico",
      },
    ],
    spells: [
      "Uivo da Matilha: Gaste 10 PM. Dá a todos os aliados do tipo Besta +2 no próximo Teste de Precisão.",
    ],
    equipment: [],
  },
  {
    id: "cr-knight",
    name: "Cavaleiro Caído",
    imageUrl:
      "https://img.freepik.com/vetores-premium/cavaleiro-caido-ajoelhado-com-a-espada-na-mao_559117-339.jpg",
    level: 15,
    species: "Morto-vivo",
    attributes: { dex: "d8", ins: "d6", mig: "d10", wlp: "d8" },
    maxHp: 75,
    maxMp: 30,
    def: 13,
    mdef: 9,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "AB",
      earth: "none",
      fire: "VU",
      ice: "none",
      light: "VU",
      poison: "IM",
    },
    basicAttacks: [
      {
        name: "Montante Enferrujado",
        attributes: ["mig", "mig"],
        damage: 12,
        type: "físico",
        description: "Atinge pesado, ignorando 2 de Defesa.",
      },
    ],
    spells: [
      "Provocar Alma: 5 PM. Obriga um alvo a atacá-lo no próximo turno.",
      "Aura de Pavor: Inimigos próximos sofrem [Abalado].",
    ],
    equipment: [],
  },
  {
    id: "cr-fire-elem",
    name: "Elemental das Chamas",
    imageUrl:
      "https://i.redd.it/elemental-support-and-kineticist-vs-sorcerer-vs-oracle-non-v0-t7j21g3ba91g1.jpg?width=800&format=pjpg&auto=webp&s=a5d2262c5b7aa31453584360d717599cce157ddc",
    level: 20,
    species: "Elemental",
    attributes: { dex: "d10", ins: "d8", mig: "d6", wlp: "d10" },
    maxHp: 80,
    maxMp: 60,
    def: 12,
    mdef: 12,
    affinities: {
      physical: "RS",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "AB",
      ice: "VU",
      light: "RS",
      poison: "IM",
    },
    basicAttacks: [
      {
        name: "Chicote Ígneo",
        attributes: ["dex", "wlp"],
        damage: 10,
        type: "fogo",
      },
    ],
    spells: [
      "Labareda: 20 PM. Causa 25 de dano de Fogo a um alvo (Ignora Resistências).",
      "Corpo Volátil: Ficar muito perto causa 5 de dano de Fogo no início de cada rodada.",
    ],
    equipment: [],
  },
  {
    id: "cr-golem",
    name: "Golem de Ferro",
    imageUrl:
      "https://pic2-cdn.creality.com/crealityCloud/upload/0c28d2e74a306db6494f21df08e6491d.png?x-oss-process=image/resize,h_600,w_800,m_fill/ignore-error,1",
    level: 25,
    species: "Construto",
    attributes: { dex: "d6", ins: "d6", mig: "d12", wlp: "d10" },
    maxHp: 120,
    maxMp: 0,
    def: 15,
    mdef: 8,
    affinities: {
      physical: "RS",
      air: "none",
      bolt: "VU",
      dark: "none",
      earth: "IM",
      fire: "none",
      ice: "none",
      light: "none",
      poison: "IM",
    },
    basicAttacks: [
      {
        name: "Pancada Sísmica",
        attributes: ["mig", "mig"],
        damage: 18,
        type: "físico",
        description: "Pode quebrar a armadura temporariamente.",
      },
    ],
    spells: [
      "Terremoto: Bate no chão causando 15 de dano de Terra a todos os inimigos terrestres.",
    ],
    equipment: [],
  },
  {
    id: "cr-archmage",
    name: "Arquimago Corrompido",
    imageUrl:
      "https://static.wikia.nocookie.net/rpg-rise-of-the-titans/images/7/7b/The_lich.jpg/revision/latest?cb=20191020041653&path-prefix=pt-br",
    level: 30,
    species: "Humanóide",
    attributes: { dex: "d8", ins: "d12", mig: "d6", wlp: "d12" },
    maxHp: 100,
    maxMp: 150,
    def: 10,
    mdef: 16,
    affinities: {
      physical: "VU",
      air: "RS",
      bolt: "RS",
      dark: "AB",
      earth: "RS",
      fire: "RS",
      ice: "RS",
      light: "VU",
      poison: "none",
    },
    basicAttacks: [
      {
        name: "Foco Místico",
        attributes: ["ins", "wlp"],
        damage: 10,
        type: "mágico",
      },
    ],
    spells: [
      "Buraco Negro: 30 PM. Causa 30 de dano Escuro em área e inflige [Lento].",
      "Distorcer Tempo: 20 PM. Ganha uma Ação Extra no próximo turno.",
      "Barreira Absoluta: 15 PM. Concede Resistência a todos os elementos exceto Luz por 2 rodadas.",
    ],
    equipment: [],
  },
  {
    id: "cr-dragon",
    name: "Dragão Vermelho Ancião",
    imageUrl: "https://wallpapercave.com/wp/wp10067023.jpg",
    level: 40,
    species: "Fera Mitológica",
    attributes: { dex: "d8", ins: "d8", mig: "d12", wlp: "d10" },
    maxHp: 200,
    maxMp: 80,
    def: 13,
    mdef: 12,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "AB",
      ice: "VU",
      light: "none",
      poison: "IM",
    },
    basicAttacks: [
      {
        name: "Garras Dracônicas",
        attributes: ["mig", "mig"],
        damage: 15,
        type: "físico",
      },
      {
        name: "Sopro de Fogo",
        attributes: ["dex", "ins"],
        damage: 25,
        type: "fogo",
        description: "Atinge todos os inimigos na área.",
      },
    ],
    spells: [
      "Rugido Aterrador: Gaste 20 PM. Todos os alvos fazem teste de VON. Se falharem, ficam Abalados e Enfraquecidos.",
    ],
    equipment: [],
  },
  {
    id: "cr-javali-selvagem",
    name: "Javali Selvagem",
    imageUrl: "http://zipline.sinapselabs.com.br/u/QI9AoJ.png",
    level: 5,
    species: "Besta",
    attributes: { dex: "d8", ins: "d6", mig: "d10", wlp: "d6" },
    maxHp: 40,
    maxMp: 0,
    def: 10,
    mdef: 8,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "RS",
      fire: "VU",
      ice: "none",
      light: "none",
      poison: "none",
    },
    basicAttacks: [
      {
        name: "Investida com Presas",
        attributes: ["mig", "mig"],
        damage: 8,
        type: "físico",
        description:
          "Pode derrubar o alvo na lama se ele falhar num teste médio.",
      },
    ],
    spells: [
      "Frenesi da Chuva: A criatura ignora penalidades de terreno difícil causadas por lama ou água.",
    ],
    equipment: [],
  },
  {
    id: "cr-lobo-emboscador",
    name: "Lobo da Tempestade",
    imageUrl: "http://zipline.sinapselabs.com.br/u/IVt6mA.jpg",
    level: 6,
    species: "Besta",
    attributes: { dex: "d10", ins: "d8", mig: "d8", wlp: "d6" },
    maxHp: 35,
    maxMp: 10,
    def: 11,
    mdef: 9,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "RS",
      earth: "none",
      fire: "VU",
      ice: "none",
      light: "none",
      poison: "none",
    },
    basicAttacks: [
      {
        name: "Mordida Feroz",
        attributes: ["dex", "mig"],
        damage: 6,
        type: "físico",
      },
    ],
    spells: [
      "Salto das Sombras (Passiva): Se o grupo falhar no Teste de Percepção (15), o lobo ataca de surpresa causando incríveis 20 de dano e derrubando o alvo na lama.",
    ],
    equipment: [],
  },
  {
    id: "cr-marionete",
    name: "A Marionete (O Caçador da Coroa)",
    imageUrl: "http://zipline.sinapselabs.com.br/u/fjKpL1.png",
    level: 15,
    species: "Aberração",
    attributes: { dex: "d12", ins: "d6", mig: "d8", wlp: "d8" },
    maxHp: 100,
    maxMp: 20,
    def: 12,
    mdef: 10,
    affinities: {
      physical: "RS",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "VU",
      ice: "none",
      light: "none",
      poison: "IM",
    },
    basicAttacks: [
      {
        name: "Lâmina Enferrujada/Garras",
        attributes: ["dex", "mig"],
        damage: 10,
        type: "físico",
        description: "Ataca em ângulos impossíveis graças aos ossos quebrados.",
      },
    ],
    spells: [
      "Fios do Titereiro (Passiva): Não pode ser morto por meios normais. Se o HP chegar a zero, no turno seguinte os filamentos injetam gosma e ele revive com metade da vida.",
      "Mirar na Nuca: Jogadores podem fazer um ataque com Desvantagem focando nos filamentos brancos. Acertar destrói o vínculo, matando a criatura instantaneamente e transformando-a em esporos.",
    ],
    equipment: [],
  },
  {
    id: "cr-nucleo-praga",
    name: "O Núcleo (A Praga Encarnada)",
    imageUrl: "https://zipline.sinapselabs.com.br/u/NBU5u2.png",
    level: 25,
    species: "Aberração",
    attributes: { dex: "d12", ins: "d6", mig: "d12", wlp: "d12" },
    maxHp: 160,
    maxMp: 60,
    def: 15,
    mdef: 14,
    affinities: {
      physical: "RS",
      air: "none",
      bolt: "none",
      dark: "AB",
      earth: "RS",
      fire: "VU",
      ice: "none",
      light: "VU",
      poison: "IM",
    },
    basicAttacks: [
      {
        name: "Chicote de Tentáculo Pálido",
        attributes: ["mig", "mig"],
        damage: 14,
        type: "físico",
        description: "Tenta agarrar e esmagar os inimigos.",
      },
    ],
    spells: [
      "Hospedeiro Perfeito (Passiva): Um jogador é engolido parcialmente e possuído. Atacar a massa principal repassa o dano ao jogador! Para vencer, é necessário mirar nos 4 tentáculos de sustentação (cada um possui 40 HP).",
      "Conflito Mental: No início do turno, o jogador possuído rola Vontade. Sucesso: Retoma o controle, dando Vantagem aos aliados no próximo ataque. Falha: O Núcleo domina e realiza um ataque extra usando as habilidades do personagem.",
      "Colapso da Caverna: 15 PM. O núcleo puxa o teto. Causa 15 de dano de Terra em área.",
    ],
    equipment: [],
  },
  {
    id: "cr-cultista-cego",
    name: "Cultista do Abismo Pálido",
    imageUrl:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRo0B9i_GQc6qIthJ1TinVsR3olPZxJrZZ9uIpwuOoQSJsIzJ06JxJFsjif&s=10",
    level: 12,
    species: "Humanóide",
    attributes: { dex: "d10", ins: "d8", mig: "d8", wlp: "d10" },
    maxHp: 65,
    maxMp: 30,
    def: 12,
    mdef: 11,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "RS",
      earth: "none",
      fire: "none",
      ice: "none",
      light: "VU",
      poison: "none",
    },
    basicAttacks: [
      {
        name: "Lâmina Cerimonial Torta",
        attributes: ["dex", "mig"],
        damage: 10,
        type: "físico",
        description: "Fere não apenas a carne, mas drena a vontade de lutar.",
      },
    ],
    spells: [
      "Vislumbre da Loucura: 10 PM. O cultista arranca a própria venda. Teste Oposto de VON. Falha deixa o jogador [Abalado] e [Enfraquecido].",
      "Sacrifício Profano (Passiva): Se o Cultista for reduzido a 0 HP, seu corpo explode em tentáculos sombrios curando a Aberração aliada mais próxima em 30 HP.",
    ],
    equipment: [],
  },
  {
    id: "cr-amalgama",
    name: "Texugo do Mel",
    imageUrl: "http://zipline.sinapselabs.com.br/u/N8UcX2.png",
    level: 22,
    species: "Morto-vivo",
    attributes: { dex: "d6", ins: "d6", mig: "d12", wlp: "d10" },
    maxHp: 180,
    maxMp: 40,
    def: 10,
    mdef: 9,
    affinities: {
      physical: "RS",
      air: "none",
      bolt: "none",
      dark: "AB",
      earth: "none",
      fire: "VU",
      ice: "none",
      light: "VU",
      poison: "IM",
    },
    basicAttacks: [
      {
        name: "Dezenas de Braços Quebrados",
        attributes: ["mig", "mig"],
        damage: 16,
        type: "físico",
        description:
          "Agarra e esmaga. Multi(2) se o alvo estiver com status negativo.",
      },
      {
        name: "Vômito Necrótico",
        attributes: ["dex", "mig"],
        damage: 12,
        type: "veneno",
        description: "Ácido negro que derrete armaduras.",
      },
    ],
    spells: [
      "Gritos Multidimensionais: 15 PM. Todos os rostos da criatura gritam com vozes de vítimas passadas. Causa 10 de dano Escuro a todo o grupo e drena 10 PM de cada um.",
      "Assimilar a Presa (Passiva): Qualquer dano corpo-a-corpo recebido pela massa respinga ácido no atacante, causando 5 de dano de Veneno automático.",
      "Mortalha Expansiva: A criatura cresce durante a batalha. Quando chega a 50% de HP, sua Defesa cai para 8, mas ela ganha 1 ação extra por rodada.",
    ],
    equipment: [],
  },
  {
    id: "cr-leviata-cosmico",
    name: "O Que Devora as Estrelas",
    imageUrl: "http://zipline.sinapselabs.com.br/u/41qr7X.png",
    level: 50,
    species: "Fera Mitológica",
    attributes: { dex: "d6", ins: "d12", mig: "d12", wlp: "d12" },
    maxHp: 400,
    maxMp: 300,
    def: 16,
    mdef: 18,
    affinities: {
      physical: "RS",
      air: "RS",
      bolt: "RS",
      dark: "AB",
      earth: "IM",
      fire: "none",
      ice: "IM",
      light: "VU",
      poison: "IM",
    },
    basicAttacks: [
      {
        name: "Mordida Gravitacional",
        attributes: ["mig", "mig"],
        damage: 25,
        type: "físico",
        description:
          "Esmaga o espaço ao redor do alvo, impossível de evadir convencionalmente.",
      },
      {
        name: "Sopro da Entropia",
        attributes: ["ins", "wlp"],
        damage: 20,
        type: "escuro",
        description: "Uma rajada de puro nada que envelhece o que toca.",
      },
    ],
    spells: [
      "Colapso de Supernova: 50 PM. Uma explosão massiva de radiação cósmica. Causa 40 de Dano de Fogo e 40 de Dano Escuro a todo o grupo. Ignora defesas.",
      "Gravidade Esmagadora: 20 PM. Muda o terreno da batalha. Pelas próximas 3 rodadas, nenhum personagem pode realizar ataques corpo-a-corpo que necessitem sair do lugar. Todos os atributos DES do grupo operam no máximo como d6.",
      "Céu Sem Estrelas (Passiva Chefe Mítico): Ao perder a primeira barra de HP (200 HP), O Devorador suga o cenário para dentro de si. A sala escurece e ele cura 100 de HP. Pontos de Fabula custam o dobro para serem ativados até o fim do combate.",
    ],
    equipment: [],
  },
  {
    id: "cr-babuino-comum",
    name: "Babuíno Comum",
    imageUrl:
      "https://i.pinimg.com/1200x/31/cd/43/31cd43cc103bd783353855cf92ed691c.jpg",
    level: 5,
    species: "Besta",
    attributes: { dex: "d10", ins: "d8", mig: "d8", wlp: "d6" },
    maxHp: 40,
    maxMp: 10,
    def: 11,
    mdef: 8,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "VU",
      ice: "none",
      light: "none",
      poison: "none",
    },
    basicAttacks: [
      {
        name: "Mordida Violenta",
        attributes: ["dex", "mig"],
        damage: 8,
        type: "físico",
        description: "Uma mordida rápida com presas afiadas.",
      },
      {
        name: "Arremesso de Entulhos",
        attributes: ["dex", "ins"],
        damage: 6,
        type: "físico",
        description: "Joga pedras ou galhos de uma distância segura.",
      },
    ],
    spells: [
      "Fúria do Bando (Passiva): Se houver pelo menos um aliado da espécie Besta ativo no combate, o Babuíno ganha +2 nos testes de Precisão.",
    ],
    equipment: [],
  },
  {
    id: "cr-bandido-capanga",
    name: "Mercenário",
    imageUrl:
      "https://i.pinimg.com/236x/57/c8/33/57c8337c51b17ef9c75536bb58c736c8.jpg",
    level: 5,
    species: "Humanóide",
    attributes: { dex: "d8", ins: "d6", mig: "d10", wlp: "d6" },
    maxHp: 45,
    maxMp: 15,
    def: 12,
    mdef: 8,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "none",
      ice: "none",
      light: "none",
      poison: "VU",
    },
    basicAttacks: [
      {
        name: "Clava Cheia de Pregos",
        attributes: ["mig", "mig"],
        damage: 10,
        type: "físico",
        description: "Um ataque bruto que foca em esmagar ossos.",
      },
    ],
    spells: [
      "Golpe Baixo: Gaste 5 PM após acertar um ataque. O alvo deve fazer um Teste de Vigor (MIG + MIG) ou sofrerá [Enfraquecido].",
      "Sangue Frio (Passiva): Quando o HP deste capanga cai pela metade (Crise), ele ganha +2 em Testes de Precisão.",
    ],
    equipment: [],
  },
  {
    id: "cr-bandido-atirador",
    name: "Caçador de Recompensas",
    imageUrl:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTOLjukFeGmBkJT-nmfzWoZVPiZe8f-86f2E5P3EkHIQ8M5eivrJ7U8aARs&s=10",
    level: 6,
    species: "Humanóide",
    attributes: { dex: "d10", ins: "d8", mig: "d6", wlp: "d6" },
    maxHp: 35,
    maxMp: 20,
    def: 11,
    mdef: 9,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "VU",
      ice: "none",
      light: "none",
      poison: "RS",
    },
    basicAttacks: [
      {
        name: "Besta de Mão",
        attributes: ["dex", "ins"],
        damage: 8,
        type: "físico",
        description: "Dispara virotes de uma distância segura.",
      },
      {
        name: "Faca Escondida",
        attributes: ["dex", "mig"],
        damage: 4,
        type: "físico",
        description: "Usado apenas se o inimigo chegar muito perto.",
      },
    ],
    spells: [
      "Virote Envenenado (Passiva): Se o HR (Dado Maior) do ataque com a Besta for 8 ou mais, o alvo sofre [Envenenado].",
      "Fuga Tática: 10 PM. Como reação ao ser atacado corpo-a-corpo, ele pode recuar, impondo Desvantagem no ataque do inimigo.",
    ],
    equipment: [],
  },
  {
    id: "cr-bandido-ocultista",
    name: "Ocultista",
    imageUrl:
      "https://i.pinimg.com/236x/40/58/f8/4058f8f739045583174deec606a782ac.jpg",
    level: 8,
    species: "Humanóide",
    attributes: { dex: "d6", ins: "d8", mig: "d6", wlp: "d10" },
    maxHp: 40,
    maxMp: 45,
    def: 9,
    mdef: 12,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "RS",
      earth: "none",
      fire: "none",
      ice: "none",
      light: "VU",
      poison: "none",
    },
    basicAttacks: [
      {
        name: "Cajado de Madeira Quebrada",
        attributes: ["ins", "wlp"],
        damage: 6,
        type: "físico",
        description: "Um ataque mágico simples com o cajado.",
      },
    ],
    spells: [
      "Ordem do Chefe: 10 PM. Um aliado humanoide à sua escolha pode realizar uma Ação de Ataque básico imediatamente.",
      "Esfera de Sombras: 15 PM. Causa 15 de dano Escuro a um alvo e, se acertar, o alvo sofre [Abalado].",
      "Curandeiro Clandestino: 10 PM. Restaura 20 de HP de um aliado (mas ele não curará aliados a não ser que estejam à beira da morte).",
    ],
    equipment: [],
  },
  {
    id: "cr-guarda-balestra",
    name: "Guarda da Cidade (Balestra)",
    imageUrl:
      "https://i.pinimg.com/736x/59/13/49/591349c95a543ca29b6c8c3ae39591b1.jpg",
    level: 5,
    species: "Humanóide",
    attributes: { dex: "d10", ins: "d8", mig: "d6", wlp: "d6" },
    maxHp: 35,
    maxMp: 20,
    def: 11,
    mdef: 9,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "none",
      ice: "none",
      light: "none",
      poison: "none",
    },
    basicAttacks: [
      {
        name: "Balestra Pesada",
        attributes: ["dex", "ins"],
        damage: 10,
        type: "físico",
        description:
          "Dispara um poderoso virote perfurante a longas distâncias.",
      },
    ],
    spells: [
      "Tiro de Cobertura (Reação): Gaste 10 PM. Quando um aliado do Guarda for atacado, ele dispara um virote que impõe Desvantagem no teste de Precisão do atacante inimigo.",
    ],
    equipment: [],
  },
  {
    id: "cr-guarda-lanca",
    name: "Guarda da Cidade (Lança)",
    imageUrl:
      "https://i.pinimg.com/1200x/17/13/28/171328217c8602b2c8be1d6854035e92.jpg",
    level: 6,
    species: "Humanóide",
    attributes: { dex: "d8", ins: "d6", mig: "d10", wlp: "d6" },
    maxHp: 50,
    maxMp: 15,
    def: 12,
    mdef: 8,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "none",
      ice: "none",
      light: "none",
      poison: "none",
    },
    basicAttacks: [
      {
        name: "Lança Longa",
        attributes: ["dex", "mig"],
        damage: 9,
        type: "físico",
        description:
          "Uma estocada de longo alcance. Pode atingir alvos Inalcançáveis ou Voadores.",
      },
    ],
    spells: [
      "Manter a Linha (Passiva): Enquanto houver pelo menos um outro Guarda aliado vivo na batalha, este guarda ganha +1 na Defesa Física e Defesa Mágica.",
    ],
    equipment: [],
  },
  {
    id: "cr-guarda-cavalo",
    name: "Guarda da Cidade (Montado)",
    imageUrl:
      "https://i.pinimg.com/736x/9c/d2/ec/9cd2ec1050aeb139da23854ee23c1df9.jpg",
    level: 8,
    species: "Humanóide",
    attributes: { dex: "d8", ins: "d8", mig: "d10", wlp: "d6" },
    maxHp: 65,
    maxMp: 25,
    def: 13,
    mdef: 9,
    affinities: {
      physical: "none",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "none",
      ice: "none",
      light: "none",
      poison: "none",
    },
    basicAttacks: [
      {
        name: "Investida Pesada",
        attributes: ["mig", "mig"],
        damage: 12,
        type: "físico",
        description:
          "O peso do cavalo e a arma do cavaleiro atacam como um só.",
      },
    ],
    spells: [
      "Pisoteio: 15 PM. Causa 15 de dano Físico a todos os inimigos que não estiverem voando. Inimigos atingidos devem passar em um Teste de Vigor ou ficarão com o status [Lento].",
      "Mobilidade Superior (Passiva): O Guarda Montado ignora terrenos difíceis e penalidades de movimento de clima ou lama.",
    ],
    equipment: [],
  },
  {
    id: "cr-guarda-espada",
    name: "Guarda da Cidade (Espada e Escudo)",
    imageUrl:
      "https://i.pinimg.com/736x/15/ce/ac/15ceacefdc00b8f6cb0b86948d698d8f.jpg",
    level: 7,
    species: "Humanóide",
    attributes: { dex: "d8", ins: "d6", mig: "d8", wlp: "d8" },
    maxHp: 55,
    maxMp: 20,
    def: 14,
    mdef: 10,
    affinities: {
      physical: "RS",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "none",
      ice: "none",
      light: "none",
      poison: "none",
    },
    basicAttacks: [
      {
        name: "Corte Disciplinado",
        attributes: ["dex", "mig"],
        damage: 9,
        type: "físico",
        description: "Um ataque marcial limpo, focado em precisão.",
      },
    ],
    spells: [
      "Bloqueio com Escudo (Passiva): Possui escudo pesado, concedendo-lhe Resistência (RS) a dano físico normal.",
      "Proteger Cidadão/Aliado (Reação): 5 PM. Quando um aliado (ou um civil) for sofrer dano físico, este Guarda toma a frente do golpe e sofre apenas metade daquele dano em si mesmo, protegendo o alvo original.",
    ],
    equipment: [],
  },
  {
    id: "cr-gorila-infectado",
    name: "Gorila Infectado",
    imageUrl:
      "https://i.redd.it/cordyceps-animals-would-be-terrifying-a-clicker-lion-would-v0-nshid56d3cob1.jpg?width=1170&format=pjpg&auto=webp&s=afad69063ffc28713ebb52fd8d3cf1f98f52d49f",
    level: 12,
    species: "Morto-Vivo / Fera",
    attributes: { dex: "d8", ins: "d6", mig: "d12", wlp: "d10" },
    maxHp: 95,
    maxMp: 30,
    def: 13,
    mdef: 8,
    affinities: {
      physical: "RS",
      air: "none",
      bolt: "none",
      dark: "none",
      earth: "none",
      fire: "VU",
      ice: "none",
      light: "none",
      poison: "IM",
    },
    basicAttacks: [
      {
        name: "Esmagamento Colossal",
        attributes: ["mig", "mig"],
        damage: 16,
        type: "físico",
        description:
          "Ergue seus braços maciços e golpeia o chão ou o alvo com uma força brutal, ignorando bloqueios leves.",
      },
      {
        name: "Mordida Fúngica",
        attributes: ["dex", "mig"],
        damage: 10,
        type: "físico",
        description:
          "Morde o alvo com dentes apodrecidos e placas de fungo pulsantes.",
      },
    ],
    spells: [
      "Blindagem de Cordyceps (Passiva): O fungo endurecido que cobre seu corpo age como uma armadura natural grossa. Ele possui Imunidade (IM) a Veneno e Resistência (RS) a dano Físico, mas é extremamente Vulnerável (VU) a Fogo.",
      "Nuvem de Esporos: 15 PM. O gorila bate violentamente no próprio peito, liberando uma nuvem de esporos tóxicos. Todos os inimigos próximos sofrem 15 de dano de Veneno e devem passar em um Teste de Vigor (MIG + MIG) ou ficarão com o status [Envenenado].",
      "Frenesi da Morte (Passiva): Quando o HP desta criatura cai pela metade (Crise), o fungo assume o controle total do sistema nervoso. O Gorila Infectado ganha +5 de dano em todos os ataques básicos, mas sofre -2 em sua Defesa (DEF).",
    ],
    equipment: [],
  },
  {
    id: "cr-boss-algoz-prisma",
    name: "O Algoz do Prisma Escuro",
    imageUrl: "http://zipline.sinapselabs.com.br/u/er4e9c.jpg",
    level: 15,
    species: "Monstruosidade / Pesadelo",
    attributes: { dex: "d6", ins: "d8", mig: "d12", wlp: "d10" },
    maxHp: 220,
    maxMp: 60,
    def: 14,
    mdef: 10,
    affinities: {
      physical: "RS",
      air: "none",
      bolt: "none",
      dark: "IM",
      earth: "none",
      fire: "none",
      ice: "none",
      light: "VU",
      poison: "IM",
    },
    basicAttacks: [
      {
        name: "Arrastar da Lâmina Colossal",
        attributes: ["mig", "mig"],
        damage: 20,
        type: "físico",
        description:
          "Ele arrasta uma espada grande demais para um humano comum e desfere um golpe horizontal devastador.",
      },
      {
        name: "Agarrão Sufocante",
        attributes: ["mig", "wlp"],
        damage: 12,
        type: "físico",
        description: "Avança com a mão livre para erguer o alvo pelo pescoço.",
      },
    ],
    spells: [
      "Inexorável (Passiva de Chefe): O Algoz não conhece a pressa ou a fadiga. Ele possui Imunidade a [Envenenado] e [Lento], e **realiza 2 Ações completas por turno**.",
      "Presença Opressora: 10 PM. O som do metal arrastando e a geometria impossível do seu capacete distorcem a mente. Todos os jogadores devem fazer um Teste de Vontade (WLP + WLP) Dificuldade 11. Quem falhar sofre o status [Abalado] (impede uso de feitiços complexos ou penaliza rolagens mentais).",
      "Julgamento de Ferro: 20 PM. O Algoz levanta a espada acima da cabeça de forma antinatural e a desce partindo o chão. Causa 25 de dano Físico a um alvo. Se o alvo estiver [Abalado], este golpe ignora qualquer DEF e Resistência (RS) a dano físico da armadura.",
      "O Peso da Culpa (Passiva de Fase 2): Quando seu HP cai pela metade (Crise - 110 HP), a pressão psicológica atinge o ápice. O Algoz arranca o próprio avental de metal pesado. Sua Defesa Física (DEF) cai para 11, sua Destreza (DEX) muda temporariamente para d10, e todos os seus ataques físicos causam +5 de dano pelo resto do combate.",
    ],
    equipment: [],
  },
]
