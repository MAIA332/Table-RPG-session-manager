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
      { id: "or-persuasive", name: "Persuasivo", maxLevel: 2, description: "Gaste [Nível da Perícia x 2] PM em testes sociais para convencer alguém." },
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
      { id: "ti-gadgets", name: "Aparelhos", maxLevel: 5, description: "Desbloqueia projetos de construção nível [Nível da Perícia]." },
      { id: "ti-potion", name: "Chuva de Poções", maxLevel: 2, description: "Ao criar poções, você pode gastar PM para afetar múltiplos alvos em área." },
      { id: "ti-formula", name: "Fórmula Secreta", maxLevel: 5, description: "Aumenta a eficácia das suas poções curativas ou bombas elementais." },
      { id: "ti-visionary", name: "Visionário", maxLevel: 5, description: "Ao criar Projetos, você economiza Zênites e agiliza o tempo de criação." },
    ],
  },
  {
    id: "wanderer",
    name: "Andarilho",
    archetype: "Explorador e Caçador",
    description: "Nômades em busca de um lendário continente, exploradores desafiando o desconhecido. A natureza não é inimiga nem aliada, mas uma professora severa.",
    hpPerLevel: 5,
    mpPerLevel: 3,
    primaryAttribute: "ins",
    skills: [
      { id: "wa-companion", name: "Companheiro Fiel", maxLevel: 5, description: "Crie uma besta, construto, elemental ou planta nível 5 como companheiro." },
      { id: "wa-astute", name: "Astuto", maxLevel: 4, description: "Recupera [Nível da Perícia] Pontos de Inventário após cada teste de viagem." },
      { id: "wa-tavern", name: "Conversa de Taverna", maxLevel: 3, description: "Ao descansar em uma estalagem, faça até [Nível da Perícia] perguntas ao Mestre sobre os arredores." },
      { id: "wa-treasure", name: "Caçador de Tesouros", maxLevel: 2, description: "Faz uma descoberta no teste de viagem ao rolar (Nível da Perícia + 1) ou menos." },
      { id: "wa-traveled", name: "Bem Viajado", maxLevel: 1, description: "Reduz o dado rolado para testes de viagem em um tamanho (mínimo d6)." }
    ]
  },
  {
    id: "arcanist",
    name: "Arcanista",
    archetype: "Invocador Mítico",
    description: "Projetam sua alma para fora do corpo, ganhando habilidades sobrenaturais através da manifestação das almas de entidades míticas chamadas Arcana.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "wlp",
    skills: [
      { id: "ar-regen", name: "Regeneração Arcana", maxLevel: 6, description: "Ao descartar voluntariamente um Arcanum em Crise, você e aliados curam [Nível x 5] PV." },
      { id: "ar-bind", name: "Vincular e Invocar", maxLevel: 1, description: "Permite vincular Arcana à alma e invocá-los gastando 1 ação e 30 PM.", action: { cost: 30, resource: "mp" } },
      { id: "ar-phantom", name: "Força Fantasma", maxLevel: 6, description: "Todo o dano ignora Afinidades. Na próxima vez que causar dano no turno, causa [Nível + 4] extra." },
      { id: "ar-quick", name: "Invocação Rápida", maxLevel: 2, description: "Reduz o custo em PM do Arcanum em [Nível x 5] ou realiza imediatamente o Pulso após invocá-lo." },
      { id: "ar-ritual", name: "Ritual Arcanista", maxLevel: 1, description: "Permite realizar Rituais de Arcanismo usando [VON + VON]." }
    ]
  },
  {
    id: "chanter",
    name: "Cantor",
    archetype: "Músico Mágico",
    description: "Músicos excepcionais que dependem da força de suas almas para tecer magia em canções e apoiar os aliados no combate.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "wlp",
    skills: [
      { id: "ch-magisong", name: "Magicanção", maxLevel: 10, description: "Teca voz e música em um Verso mágico gastando PM (combina Volume, Clave e Tom)." },
      { id: "ch-resonance", name: "Ressonância", maxLevel: 3, description: "Após afetar inimigos com Versos, aliados causam [Nível] extra de dano, ou você recupera [Nível] PM ao feri-los." },
      { id: "ch-siren", name: "Canção da Sereia", maxLevel: 1, description: "Permite rituais de Ritualismo voltados para criar ilusões auditivas." },
      { id: "ch-barrier", name: "Barreira Sonora", maxLevel: 5, description: "Após cantar com volume médio/alto, todo dano físico sofrido é reduzido em [Nível]." },
      { id: "ch-vibrato", name: "Vibrato", maxLevel: 1, description: "Após cantar em volume baixo/médio, você pode realizar um ataque gratuito ignorando sua RA." }
    ]
  },
  {
    id: "commander",
    name: "Comandante",
    archetype: "Líder e Estrategista",
    description: "Figuras inspiradoras que conquistaram a lealdade de companheiros com determinação de ferro e habilidade tática.",
    hpPerLevel: 5,
    mpPerLevel: 3,
    primaryAttribute: "mig",
    skills: [
      { id: "co-bishop", name: "Édito do Bispo", maxLevel: 5, description: "Gaste 10 PM. Dobra os custos de PM ou todas as fontes causam [Nível x 3] de dano extra até o próximo turno.", action: { cost: 10, resource: "mp" } },
      { id: "co-cavalry", name: "Cavalaria de Choque", maxLevel: 5, description: "Gaste 10 PM. Um aliado realiza um ataque livre com bônus de [Nível] na Precisão.", action: { cost: 10, resource: "mp" } },
      { id: "co-chariot", name: "Carroça Esmagadora", maxLevel: 1, description: "Após usar táticas, um aliado que ainda não agiu joga imediatamente após você." },
      { id: "co-castle", name: "Castelo do Rei", maxLevel: 4, description: "Gaste 10 PM. Impede a cura de PV/PM ou todas as curas restauram [Nível x 5] PM adicionais.", action: { cost: 10, resource: "mp" } },
      { id: "co-queen", name: "Gambito da Rainha", maxLevel: 6, description: "Após um ataque livre, você pode curar a equipe ou encadear táticas em sequência." }
    ]
  },
  {
    id: "dancer",
    name: "Dançarino",
    archetype: "Acrobata Marcial",
    description: "Tornam movimentos precisos em fluxos de força espiritual que aumentam suas habilidades e repelem o mal.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "dex",
    skills: [
      { id: "da-dance", name: "Dança", maxLevel: 10, description: "Aprende uma Dança que pode ser ativada por 10 PM (ou 5 PM ao encadear).", action: { cost: 10, resource: "mp" } },
      { id: "da-follow", name: "Siga Meu Passo", maxLevel: 1, description: "Ao usar uma dança duradoura, gaste 10 PM extras para expandir seus efeitos a um aliado com um Elo." },
      { id: "da-frenzy", name: "Passos Frenéticos", maxLevel: 2, description: "Ganha [Nível x 2] em todos os testes de Acrobacia, Coordenação ou Velocidade após dançar." },
      { id: "da-quick", name: "Troca Rápida", maxLevel: 1, description: "Após dançar, pode realizar a Ação de Equipamento de graça." },
      { id: "da-wardancer", name: "Dançarino de Guerra", maxLevel: 5, description: "Seus ataques ágeis e magias ofensivas causam [Nível] de dano extra após a dança." }
    ]
  },
  {
    id: "beastmaster",
    name: "Domador",
    archetype: "Senhor das Feras",
    description: "Compreendem e negociam com monstros e bestas perigosas, recrutando essas ameaças como aliados mortais.",
    hpPerLevel: 5,
    mpPerLevel: 3,
    primaryAttribute: "ins",
    skills: [
      { id: "bm-allout", name: "Ataque Total", maxLevel: 1, description: "Gaste 10 PM para ganhar precisão baseado em atitudes variadas ou dano extra.", action: { cost: 10, resource: "mp" } },
      { id: "bm-hybrid", name: "Hibridização", maxLevel: 1, description: "Combina as afinidades e os ataques básicos de duas criaturas que você recrutou." },
      { id: "bm-intercept", name: "Interceptador", maxLevel: 6, description: "Reduz o dano sofrido por um aliado em [Nível x 4] sacrificando acesso a uma criatura até o fim da cena." },
      { id: "bm-negotiate", name: "Negociar", maxLevel: 4, description: "Permite usar a ação Objetivo para recrutar Demônios, Elementais, Monstros ou Mortos-vivos." },
      { id: "bm-release", name: "Libertar", maxLevel: 4, description: "Permite realizar Rituais para invocar criaturas do Mestre com base em [Nível x 5]." }
    ]
  },
  {
    id: "entropist",
    name: "Entropista",
    archetype: "Mago do Caos",
    description: "Manipulam as energias do Cosmos capazes de distorcer o tempo, o espaço e a probabilidade de sorte em combate.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "wlp",
    skills: [
      { id: "en-absorb", name: "Absorver PM", maxLevel: 5, description: "Após sofrer dano, você recupera imediatamente [Nível x 2] Pontos de Mente." },
      { id: "en-magic", name: "Magia Entrópica", maxLevel: 10, description: "Aprende feitiços Entrópicos. Testes ofensivos usam [INT + VON].", action: { cost: 10, resource: "mp" } },
      { id: "en-luck", name: "Sete da Sorte", maxLevel: 1, description: "Uma vez por cena, altere qualquer dado para seu 'Número da Sorte' (começa em 7)." },
      { id: "en-ritual", name: "Ritual Entrópico", maxLevel: 1, description: "Permite realizar Rituais de Entropismo usando [INT + VON]." },
      { id: "en-timesteal", name: "Tempo Roubado", maxLevel: 4, description: "Gaste até [Nível x 5] PM para causar lentidão, dano temporal, ou conceder ações extras." }
    ]
  },
  {
    id: "esper",
    name: "Esper",
    archetype: "Vidente Psíquico",
    description: "Conectam-se com a 'rede das almas' espiritual para transmitir informações e aprimorar capacidades mentais e telepáticas.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "ins",
    skills: [
      { id: "es-focus", name: "Foco Cognitivo", maxLevel: 5, description: "Mire mentalmente em um alvo; ganhe +[Nível] em precisão e magia contra ele, e amplie a cura direcionada a ele." },
      { id: "es-hyper", name: "Hipercognição", maxLevel: 5, description: "Reduz o custo em PM de magias contra seu Foco Cognitivo em [Nível x 2]." },
      { id: "es-nav", name: "Navegador", maxLevel: 1, description: "Permite telepatia a longa distância e Rituais para transportar seres na rede das almas." },
      { id: "es-gifts", name: "Dons Psíquicos", maxLevel: 5, description: "Desbloqueia poderes como Gravitocinese ou Atmocinese preenchendo um Relógio Cerebral." },
      { id: "es-telekinesis", name: "Psicocinese", maxLevel: 1, description: "Pode substituir um atributo por VON e atingir alvos voadores com ataques corpo a corpo (Arcana/Espada)." }
    ]
  },
  {
    id: "fury",
    name: "Fúria",
    archetype: "Berserker Implacável",
    description: "São enérgicos e guerreiros inquietos guiados por uma paixão que beira a descontrolada violência.",
    hpPerLevel: 6,
    mpPerLevel: 2,
    primaryAttribute: "mig",
    skills: [
      { id: "fu-adrenaline", name: "Adrenalina", maxLevel: 5, description: "Enquanto estiver em Crise, você causa [Nível x 2] de dano extra com qualquer ataque ou magia." },
      { id: "fu-frenzy", name: "Frenesi", maxLevel: 1, description: "Armas ágeis (briga, adagas, flexíveis) causam sucesso crítico se os dois dados rolarem o mesmo número." },
      { id: "fu-spirit", name: "Espírito Indomável", maxLevel: 4, description: "Ao usar um Ponto de Fábula, cure [Nível x 5] de PV, de PM, ou recupere um status negativo." },
      { id: "fu-taunt", name: "Provocar", maxLevel: 5, description: "Gaste 5 PM para furar e forçar o inimigo a te atacar. Testes (POD+VON) ganham +[Nível].", action: { cost: 5, resource: "mp" } },
      { id: "fu-endure", name: "Resistir", maxLevel: 5, description: "Ao proteger, cura PV baseado nos seus Elos e aprimora Poder ou Vontade até o fim do turno." }
    ]
  },
  {
    id: "gourmet",
    name: "Gourmet",
    archetype: "Cozinheiro Magitech",
    description: "Extraem energias espirituais de ingredientes selvagens, infundindo efeitos mágicos e melhorias impressionantes nas suas refeições.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "ins",
    skills: [
      { id: "go-cook", name: "Culinária", maxLevel: 5, description: "Gaste uma ação e combine sabores para aplicar efeitos de cura ou dano elemental. Produz [Nível] ingredientes ao descansar." },
      { id: "go-knife", name: "Faca e Garfo", maxLevel: 1, description: "Aplica os efeitos mortais das suas iguarias diretamente com o dano de sua arma." },
      { id: "go-love", name: "Feito com Amor", maxLevel: 3, description: "Gaste até [Nível x 10] PM para aplicar suas comidas mágicas a aliados adicionais." },
      { id: "go-spice", name: "Sal e Pimenta", maxLevel: 1, description: "Gaste 2 PI para transmutar à força o sabor de um ingrediente do seu estoque." },
      { id: "go-travel", name: "Cozinheiro Andarilho", maxLevel: 3, description: "Coleta [Nível x 2] ingredientes gratuitos de sabores aleatórios após cada rolagem de viagem." }
    ]
  },
  {
    id: "invoker",
    name: "Invocador",
    archetype: "Canalizador Elemental",
    description: "Manipulam o fluxo das almas ao redor, invocando entidades elementais baseadas nas fontes de energia presentes no ambiente.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "ins",
    skills: [
      { id: "in-harmony", name: "Harmonia Elemental", maxLevel: 2, description: "A cura feita na presença de um Elemental aumenta em [Nível x 5]. Fala com Elementais." },
      { id: "in-invoke", name: "Invocação", maxLevel: 3, description: "Use o ambiente para invocar 'explosões', 'maldições' ou grandes efeitos (5 PM base).", action: { cost: 5, resource: "mp" } },
      { id: "in-bound", name: "Invocação Vinculada", maxLevel: 3, description: "Gaste até [Nível x 10] PM extras para que as Invocações atinjam múltiplos alvos." },
      { id: "in-ripple", name: "Ondulações", maxLevel: 5, description: "Ataca gratuitamente um inimigo debuffado pelas maldições das invocações dos seus aliados (+[Nível] na Precisão)." },
      { id: "in-expansion", name: "Expansão da Fonte", maxLevel: 5, description: "Aumenta o dano base das explosões e a letalidade das maldições elementais em [Nível]." }
    ]
  },
  {
    id: "merchant",
    name: "Mercante",
    archetype: "Senhor do Comércio",
    description: "Comerciantes implacáveis que sabem usar suas riquezas (Zênites) como a verdadeira força que impulsiona reinos.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "wlp",
    skills: [
      { id: "me-expire", name: "Data de Validade", maxLevel: 3, description: "Corrompe curas criadas por você, causando dano de veneno de [metade do Nível + (Nível x 10)]." },
      { id: "me-heard", name: "Já Ouvi Falar!", maxLevel: 3, description: "Gaste 1 Ponto de Comércio para dar +[Nível x 2] em Exames sobre criaturas e lugares." },
      { id: "me-stock", name: "Estoque Privado", maxLevel: 3, description: "Permite gastar Pontos de Comércio para ignorar [Nível + 2] custos de PI." },
      { id: "me-treas", name: "Tesouro Real", maxLevel: 3, description: "Ao lutar contra a corrupção de grandes líderes, recebe +[Nível + 1] Pontos de Comércio." },
      { id: "me-wind", name: "Ventos do Comércio", maxLevel: 3, description: "Após descansar, recarrega [Nível + 1] Pontos de Comércio usados para subornar e manipular Zênites." }
    ]
  },
  {
    id: "loremaster",
    name: "Mestre do Conhecimento",
    archetype: "Sábio e Analista",
    description: "Possuem sede de descobertas implacável; eles trocariam todo o tesouro por um bom mistério encriptado.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "ins",
    skills: [
      { id: "lo-flash", name: "Flash de Intuição", maxLevel: 3, description: "Obtendo 13+ em investigações, faça [Nível] perguntas gratuitas e definitivas ao Mestre." },
      { id: "lo-focus", name: "Focado", maxLevel: 6, description: "Aumenta seus PM totais em [Nível x 5]. Ganha bônus ao realizar Testes Abertos de Inteligência pura." },
      { id: "lo-knowledge", name: "Conhecimento é Poder", maxLevel: 1, description: "Permite usar a Intuição como parâmetro balístico no lugar do principal para Precisão." },
      { id: "lo-assess", name: "Avaliação Rápida", maxLevel: 6, description: "Gaste [Nível x 5] PM no início do combate para ler Traços e Afinidades de todos os inimigos." },
      { id: "lo-memory", name: "Memória Treinada", maxLevel: 1, description: "Pode 'voltar no tempo' na própria mente para reviver investigações recentes da última semana." }
    ]
  },
  {
    id: "mutant",
    name: "Mutante",
    archetype: "Abominação Adaptável",
    description: "Aqueles que suportaram experimentos severos. Alteram os ossos e fluídos do corpo para se adaptarem e sobreviver em combates extremos.",
    hpPerLevel: 6,
    mpPerLevel: 3,
    primaryAttribute: "mig",
    skills: [
      { id: "mu-akro", name: "Akromorfose", maxLevel: 3, description: "Seus punhos causam [6 + (Nível x 2)] extra e mudam de classe estrutural dinamicamente (Alcance/Corpo-a-corpo)." },
      { id: "mu-bio", name: "Biofagia", maxLevel: 4, description: "Ao infligir perda de PV em Crise, consuma o alvo e recupere [Nível x 5] PV de volta." },
      { id: "mu-ecdysis", name: "Ecdise", maxLevel: 1, description: "Gaste 10 PV reativamente para criar resistência natural contra danos mágicos que te feriram." },
      { id: "mu-geno", name: "Genoclépsis", maxLevel: 2, description: "Rouba a genética dos monstros inimigos momentaneamente concedendo Formas temporárias extras." },
      { id: "mu-therio", name: "Theriomorfose", maxLevel: 6, description: "Custa 33% dos PVs: Manifesta até duas de suas evoluções mutantes devastadoras pela cena inteira." }
    ]
  },
  {
    id: "necromancer",
    name: "Necromante",
    archetype: "Senhor da Vida e da Morte",
    description: "Magos sombrios que ceifam a energia das almas no ápice mortal para animar cadáveres e roubar a essência dos vivos.",
    hpPerLevel: 3,
    mpPerLevel: 5,
    primaryAttribute: "wlp",
    skills: [
      { id: "ne-beyond", name: "Além dos Reinos da Morte", maxLevel: 5, description: "Gera Pontos de Sepultura ao presenciar mortes. Salva da própria aniquilação gastando os pontos colhidos." },
      { id: "ne-grave", name: "Filhos da Sepultura", maxLevel: 1, description: "Comunica-se com os mortos livremente. Pode interrogar espíritos falecidos para saber verdades sombrias." },
      { id: "ne-fear", name: "O Medo é a Chave", maxLevel: 3, description: "Ferir inimigos com as emoções abaladas/fracas gera Pontos de Sepultura e [Nível x 2] PV/PM passivos." },
      { id: "ne-bell", name: "Para Quem Toca o Sino", maxLevel: 3, description: "Usa Pontos de Sepultura para estourar o dano final baseado nos status negativos que o alvo possui." },
      { id: "ne-rondo", name: "Rondo do Pesadelo", maxLevel: 1, description: "Consome 2 Pontos de Sepultura para transformar feitiços singulares em obliterações em área (Dano Escuro puro)." }
    ]
  },
  {
    id: "pilot",
    name: "Piloto",
    archetype: "Cavaleiro Motorizado",
    description: "Treinados para agir na velocidade do ferro e das máquinas, usam um exoesqueleto, nave ou mecha de combate em sinergia com o próprio corpo.",
    hpPerLevel: 5,
    mpPerLevel: 3,
    primaryAttribute: "dex",
    skills: [
      { id: "pi-compress", name: "Compressão Tecnológica", maxLevel: 1, description: "Guarde seu Mecha gigante no bolso usando 2 PI para invocar o transporte a qualquer momento." },
      { id: "pi-flex", name: "Configuração Flexível", maxLevel: 4, description: "Permite reativar [Nível] módulos da nave (armas, reatores, espadas magnéticas) durante o tiroteio em tempo real." },
      { id: "pi-heart", name: "Coração no Motor", maxLevel: 3, description: "Gaste 10 PM para injetar [Nível x 2] em sobrecarga nos canhões ou nos defletores passivos do chassi." },
      { id: "pi-vehicle", name: "Veículo Pessoal", maxLevel: 5, description: "O Nível determina a escala do Mecha, garantindo mais opções de armas de suporte massivas ou placas de blindagem pesadas." },
      { id: "pi-grip", name: "Agarre Firme", maxLevel: 1, description: "Módulos de mira ganham assistência cibernética: Subtitua rolagens puras de precisão usando POD." }
    ]
  },
  {
    id: "chimerist",
    name: "Quimerista",
    archetype: "Metamorfo e Plagiador",
    description: "Reúnem poder decifrando os instintos selvagens. Imitam e absorvem conhecimentos e a magia direta de animais e feras da natureza.",
    hpPerLevel: 4,
    mpPerLevel: 5,
    primaryAttribute: "ins",
    skills: [
      { id: "qm-consume", name: "Consumir", maxLevel: 5, description: "Rouba as essências de feras e inimigos elementais conjurados; devolve [Nível x 2] PM por conjuração arcana letal." },
      { id: "qm-speak", name: "Fala Bestial", maxLevel: 1, description: "Permite livre comunicação biológica com Espécies do tipo Besta, Monstro e Plantas arcanas." },
      { id: "qm-patho", name: "Patogênese", maxLevel: 1, description: "Usa o conhecimento de doenças: Suas conjurações roubadas intoxicam outras feras do mesmo bioma copiando o veneno nativo." },
      { id: "qm-ritual", name: "Ritual Quimerista", maxLevel: 1, description: "Aplica princípios Rituais na biologia da metamorfose para evocações [INT + VON]." },
      { id: "qm-mimic", name: "Imitar Magia", maxLevel: 10, description: "O maior trunfo: Memorize instantaneamente a magia do Monstro-Chefe inimigo e use contra eles no futuro!" }
    ]
  },
  {
    id: "symbolist",
    name: "Simbolista",
    archetype: "Criador de Talismãs",
    description: "Ocultistas precisos que codificam maldições ou aprimoramentos através de símbolos vitais: selos mágicos e pinturas encantadas.",
    hpPerLevel: 4,
    mpPerLevel: 4,
    primaryAttribute: "wlp",
    skills: [
      { id: "sy-magic", name: "Símbolos Mágicos", maxLevel: 3, description: "Destrua reativamente selos aplicados nos aliados para replicar feitiços com até [Nível x 10] de valor rúnico passivo." },
      { id: "sy-mirage", name: "Miragem", maxLevel: 1, description: "O Ritualismo focará integralmente no controle massivo da percepção ocular (ilusões de ótica ativas em combate)." },
      { id: "sy-touch", name: "Toque Pessoal", maxLevel: 5, description: "Toda fonte de recuperação e ataque sob o selo de proteção ganha bônus contínuos passivos escalados em [Nível]." },
      { id: "sy-connect", name: "Conexão Simbólica", maxLevel: 1, description: "Radar Rúnico absoluto da própria guilda; Rastrei um indivíduo traidor ou em perigo sob seus sigilos em dias de viagem." },
      { id: "sy-symbolism", name: "Simbolismo", maxLevel: 5, description: "Invoca os totens na rodada de preparação; cria [Nível + 1] Símbolos de Ligação, Medo ou Crescimento nos escudos da party." }
    ]
  },
  {
    id: "cleric",
    name: "Clérigo",
    archetype: "Curandeiro Primário",
    description: "Servos devotos e guardiões da vida que utilizam os poderes da fé e compaixão para restaurar ferimentos e proteger aliados do fim iminente.",
    hpPerLevel: 4,
    mpPerLevel: 5,
    primaryAttribute: "wlp",
    skills: [
      { 
        id: "cl-aura", 
        name: "Aura Curativa", 
        maxLevel: 5, 
        description: "Sempre que restaurar os PV de um ou mais aliados através de magias ou habilidades, eles recuperam [Nível da Perícia x 2] PV adicionais." 
      },
      { 
        id: "cl-purify", 
        name: "Mãos Purificadoras", 
        maxLevel: 3, 
        description: "Ao aplicar um efeito de cura em um aliado, você pode remover até [Nível da Perícia] condições de status negativas dele sem nenhum custo de PM adicional." 
      },
      { 
        id: "cl-sanctuary", 
        name: "Santuário", 
        maxLevel: 4, 
        description: "Enquanto você não estiver em Crise, você e os aliados com os quais tem um Elo recuperam [Nível da Perícia x 5] PV automaticamente no início do seu turno." 
      },
      { 
        id: "cl-breath", 
        name: "Sopro de Vida", 
        maxLevel: 1, 
        description: "Uma vez por cena, se um aliado for reduzido a 0 PV, você pode gastar 20 PM como uma reação imediata para evitar que ele caia, restaurando-o com metade dos PV máximos dele.", 
        action: { cost: 20, resource: "mp" } 
      },
      { 
        id: "cl-martyr", 
        name: "Martírio Compassivo", 
        maxLevel: 5, 
        description: "Gaste uma ação para perder voluntariamente até [Nível x 10] PV (este dano não pode ser reduzido). Distribua o dobro do valor perdido como cura de PV entre qualquer número de aliados que você possa ver.", 
        action: { cost: 0, resource: "hp" } 
      }
    ]
  }
];

export function getClass(id: string): GameClass | undefined {
  return CLASSES.find((c) => c.id === id)
}

export const INVENTORY_ACTIONS = [
  
]

export const EQUIPMENT: EquipmentItem[] = [
  { id: "eq-dagger", name: "Adaga de Aço", category: "weapon", cost: 150, purchasable: true, detail: "Arma Leve. Dano físico.\n[MODIFICADOR: Precisão usa DES + AST]" },
  { id: "eq-sword", name: "Espada de Bronze", category: "weapon", cost: 200, purchasable: true, detail: "Arma Marcial. Dano físico.\n[MODIFICADOR: Precisão usa DES + VIG]" },
  { id: "eq-greatsword", name: "Montante", category: "weapon", cost: 200, purchasable: true, detail: "Arma Pesada. Dano físico alto.\n[MODIFICADOR: Precisão usa DES + VIG]" },
  { id: "eq-bow", name: "Arco Curto", category: "weapon", cost: 200, purchasable: true, detail: "Arma à distância. Dano físico.\n[MODIFICADOR: Precisão usa DES + DES]" },
  { id: "eq-staff", name: "Cajado Arcano", category: "weapon", cost: 100, purchasable: true, detail: "Foco mágico. Dano mágico.\n[MODIFICADOR: Precisão usa VON + VON]" },
  { id: "eq-spear", name: "Lança Leve", category: "weapon", cost: 200, purchasable: true, detail: "Arma de Haste. Dano físico.\n[MODIFICADOR: Precisão usa DES + VIG]" },
  
  // NOVAS ARMAS (Adicionadas da Narrativa)
  { id: "eq-crossbow", name: "Arco Balestra", category: "weapon", cost: 250, purchasable: true, detail: "Arma à distância mecânica pesada. Dano físico perfurante.\n[MODIFICADOR: Precisão usa DES + INS]" },

  { id: "eq-travel", name: "Traje de Viagem", category: "armor", cost: 100, purchasable: true, detail: "Armadura Leve.\n[MODIFICADOR: Defesa = DES + 1]" },
  { id: "eq-brigandine", name: "Brigantina", category: "armor", cost: 150, purchasable: true, detail: "Armadura Marcial.\n[MODIFICADOR: Defesa fixa em 10]" },
  { id: "eq-plate", name: "Placa de Bronze", category: "armor", cost: 200, purchasable: true, detail: "Armadura Pesada. Reduz Inic.\n[MODIFICADOR: Defesa fixa em 11]" },
  { id: "eq-buckler", name: "Escudo de Bronze", category: "shield", cost: 100, purchasable: true, detail: "Escudo Leve.\n[MODIFICADOR: +2 Defesa]" },
  { id: "eq-shield", name: "Escudo Rúnico", category: "shield", cost: 150, purchasable: true, detail: "Escudo Marcial.\n[MODIFICADOR: +2 Defesa e DefM]" },
  
  // ACESSÓRIOS E UTILITÁRIOS (Adicionados da Narrativa)
  { id: "eq-lantern", name: "Lamparina", category: "accessory", cost: 50, purchasable: true, detail: "Fonte de luz confiável movida a óleo. Essencial para explorar cavernas obscuras." },
  { id: "eq-wet-twine", name: "Fios de Barbante Molhados", category: "accessory", cost: 5, purchasable: false, detail: "Um punhado de barbantes encharcados. Fragilizados pela umidade, mas podem quebrar um galho em armadilhas simples." },
  { id: "eq-quiver-20", name: "Aljava (20 Flechas)", category: "accessory", cost: 30, purchasable: true, detail: "Recipiente de couro contendo munição suficiente para um longo combate à distância." },

  // ITENS EXCLUSIVOS DO MESTRE (Não aparecem na loja)
  { id: "eq-excalibur", name: "Excalibur Maldita", category: "weapon", cost: 1000, purchasable: false, detail: "Artefato Ancião. Dano físico massivo.\n[MODIFICADOR: Precisão VIG + VIG, +5 Dano]" },
  { id: "eq-dragon-scale", name: "Escamas do Dragão", category: "armor", cost: 1500, purchasable: false, detail: "Armadura Lendária. Resistência a Fogo.\n[MODIFICADOR: Defesa fixa em 13]" }
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
    imageUrl: "https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=400&auto=format&fit=crop",
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
    spells: ["Roubar Item: O Goblin rouba 10z de um alvo."],
    equipment: []
  },
  {
    id: "cr-slime",
    name: "Lodo Tóxico",
    imageUrl: "https://images.unsplash.com/photo-1500367215255-0e0b258c40fa?q=80&w=400&auto=format&fit=crop",
    level: 5,
    species: "Monstro",
    attributes: { dex: "d6", ins: "d6", mig: "d10", wlp: "d8" },
    maxHp: 45,
    maxMp: 10,
    def: 8,
    mdef: 10,
    affinities: { physical: "RS", air: "none", bolt: "VU", dark: "none", earth: "none", fire: "VU", ice: "none", light: "none", poison: "IM" },
    basicAttacks: [
      { name: "Tentáculo Ácido", attributes: ["mig", "mig"], damage: 6, type: "veneno", description: "Pode infligir [Envenenado] no alvo." }
    ],
    spells: ["Divisão Celular: Se sofrer dano cortante, cria uma cópia com metade do HP atual."],
    equipment: []
  },
  {
    id: "cr-wolf",
    name: "Lobo Cárgico",
    imageUrl: "https://images.unsplash.com/photo-1590422730036-79133bd40049?q=80&w=400&auto=format&fit=crop",
    level: 10,
    species: "Besta",
    attributes: { dex: "d10", ins: "d8", mig: "d8", wlp: "d6" },
    maxHp: 50,
    maxMp: 20,
    def: 11,
    mdef: 8,
    affinities: { physical: "none", air: "none", bolt: "none", dark: "none", earth: "none", fire: "none", ice: "RS", light: "none", poison: "none" },
    basicAttacks: [
      { name: "Mordida Feroz", attributes: ["dex", "mig"], damage: 8, type: "físico" }
    ],
    spells: ["Uivo da Matilha: Gaste 10 PM. Dá a todos os aliados do tipo Besta +2 no próximo Teste de Precisão."],
    equipment: []
  },
  {
    id: "cr-knight",
    name: "Cavaleiro Caído",
    imageUrl: "https://images.unsplash.com/photo-1601662998394-4360e2ce1f3d?q=80&w=400&auto=format&fit=crop",
    level: 15,
    species: "Morto-vivo",
    attributes: { dex: "d8", ins: "d6", mig: "d10", wlp: "d8" },
    maxHp: 75,
    maxMp: 30,
    def: 13,
    mdef: 9,
    affinities: { physical: "none", air: "none", bolt: "none", dark: "AB", earth: "none", fire: "VU", ice: "none", light: "VU", poison: "IM" },
    basicAttacks: [
      { name: "Montante Enferrujado", attributes: ["mig", "mig"], damage: 12, type: "físico", description: "Atinge pesado, ignorando 2 de Defesa." }
    ],
    spells: [
      "Provocar Alma: 5 PM. Obriga um alvo a atacá-lo no próximo turno.",
      "Aura de Pavor: Inimigos próximos sofrem [Abalado]."
    ],
    equipment: []
  },
  {
    id: "cr-fire-elem",
    name: "Elemental das Chamas",
    imageUrl: "https://images.unsplash.com/photo-1497906539264-eb74442e37a9?q=80&w=400&auto=format&fit=crop",
    level: 20,
    species: "Elemental",
    attributes: { dex: "d10", ins: "d8", mig: "d6", wlp: "d10" },
    maxHp: 80,
    maxMp: 60,
    def: 12,
    mdef: 12,
    affinities: { physical: "RS", air: "none", bolt: "none", dark: "none", earth: "none", fire: "AB", ice: "VU", light: "RS", poison: "IM" },
    basicAttacks: [
      { name: "Chicote Ígneo", attributes: ["dex", "wlp"], damage: 10, type: "fogo" }
    ],
    spells: [
      "Labareda: 20 PM. Causa 25 de dano de Fogo a um alvo (Ignora Resistências).",
      "Corpo Volátil: Ficar muito perto causa 5 de dano de Fogo no início de cada rodada."
    ],
    equipment: []
  },
  {
    id: "cr-golem",
    name: "Golem de Ferro",
    imageUrl: "https://images.unsplash.com/photo-1616422285623-13ff0162193c?q=80&w=400&auto=format&fit=crop",
    level: 25,
    species: "Construto",
    attributes: { dex: "d6", ins: "d6", mig: "d12", wlp: "d10" },
    maxHp: 120,
    maxMp: 0,
    def: 15,
    mdef: 8,
    affinities: { physical: "RS", air: "none", bolt: "VU", dark: "none", earth: "IM", fire: "none", ice: "none", light: "none", poison: "IM" },
    basicAttacks: [
      { name: "Pancada Sísmica", attributes: ["mig", "mig"], damage: 18, type: "físico", description: "Pode quebrar a armadura temporariamente." }
    ],
    spells: [
      "Terremoto: Bate no chão causando 15 de dano de Terra a todos os inimigos terrestres."
    ],
    equipment: []
  },
  {
    id: "cr-archmage",
    name: "Arquimago Corrompido",
    imageUrl: "https://images.unsplash.com/photo-1519074069444-1ba4fff66d16?q=80&w=400&auto=format&fit=crop",
    level: 30,
    species: "Humanóide",
    attributes: { dex: "d8", ins: "d12", mig: "d6", wlp: "d12" },
    maxHp: 100,
    maxMp: 150,
    def: 10,
    mdef: 16,
    affinities: { physical: "VU", air: "RS", bolt: "RS", dark: "AB", earth: "RS", fire: "RS", ice: "RS", light: "VU", poison: "none" },
    basicAttacks: [
      { name: "Foco Místico", attributes: ["ins", "wlp"], damage: 10, type: "mágico" }
    ],
    spells: [
      "Buraco Negro: 30 PM. Causa 30 de dano Escuro em área e inflige [Lento].",
      "Distorcer Tempo: 20 PM. Ganha uma Ação Extra no próximo turno.",
      "Barreira Absoluta: 15 PM. Concede Resistência a todos os elementos exceto Luz por 2 rodadas."
    ],
    equipment: []
  },
  {
    id: "cr-dragon",
    name: "Dragão Vermelho Ancião",
    imageUrl: "https://images.unsplash.com/photo-1577493341514-63cb53531fb5?q=80&w=400&auto=format&fit=crop",
    level: 40,
    species: "Fera Mitológica",
    attributes: { dex: "d8", ins: "d8", mig: "d12", wlp: "d10" },
    maxHp: 200,
    maxMp: 80,
    def: 13,
    mdef: 12,
    affinities: { physical: "none", air: "none", bolt: "none", dark: "none", earth: "none", fire: "AB", ice: "VU", light: "none", poison: "IM" },
    basicAttacks: [
      { name: "Garras Dracônicas", attributes: ["mig", "mig"], damage: 15, type: "físico" },
      { name: "Sopro de Fogo", attributes: ["dex", "ins"], damage: 25, type: "fogo", description: "Atinge todos os inimigos na área." }
    ],
    spells: ["Rugido Aterrador: Gaste 20 PM. Todos os alvos fazem teste de VON. Se falharem, ficam Abalados e Enfraquecidos."],
    equipment: []
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
    affinities: { physical: "none", air: "none", bolt: "none", dark: "none", earth: "RS", fire: "VU", ice: "none", light: "none", poison: "none" },
    basicAttacks: [
      { name: "Investida com Presas", attributes: ["mig", "mig"], damage: 8, type: "físico", description: "Pode derrubar o alvo na lama se ele falhar num teste médio." }
    ],
    spells: [
      "Frenesi da Chuva: A criatura ignora penalidades de terreno difícil causadas por lama ou água."
    ],
    equipment: []
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
    affinities: { physical: "none", air: "none", bolt: "none", dark: "RS", earth: "none", fire: "VU", ice: "none", light: "none", poison: "none" },
    basicAttacks: [
      { name: "Mordida Feroz", attributes: ["dex", "mig"], damage: 6, type: "físico" }
    ],
    spells: [
      "Salto das Sombras (Passiva): Se o grupo falhar no Teste de Percepção (15), o lobo ataca de surpresa causando incríveis 20 de dano e derrubando o alvo na lama."
    ],
    equipment: []
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
    affinities: { physical: "RS", air: "none", bolt: "none", dark: "none", earth: "none", fire: "VU", ice: "none", light: "none", poison: "IM" },
    basicAttacks: [
      { name: "Lâmina Enferrujada/Garras", attributes: ["dex", "mig"], damage: 10, type: "físico", description: "Ataca em ângulos impossíveis graças aos ossos quebrados." }
    ],
    spells: [
      "Fios do Titereiro (Passiva): Não pode ser morto por meios normais. Se o HP chegar a zero, no turno seguinte os filamentos injetam gosma e ele revive com metade da vida.",
      "Mirar na Nuca: Jogadores podem fazer um ataque com Desvantagem focando nos filamentos brancos. Acertar destrói o vínculo, matando a criatura instantaneamente e transformando-a em esporos."
    ],
    equipment: []
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
    affinities: { physical: "RS", air: "none", bolt: "none", dark: "AB", earth: "RS", fire: "VU", ice: "none", light: "VU", poison: "IM" },
    basicAttacks: [
      { name: "Chicote de Tentáculo Pálido", attributes: ["mig", "mig"], damage: 14, type: "físico", description: "Tenta agarrar e esmagar os inimigos." }
    ],
    spells: [
      "Hospedeiro Perfeito (Passiva): Um jogador é engolido parcialmente e possuído. Atacar a massa principal repassa o dano ao jogador! Para vencer, é necessário mirar nos 4 tentáculos de sustentação (cada um possui 40 HP).",
      "Conflito Mental: No início do turno, o jogador possuído rola Vontade. Sucesso: Retoma o controle, dando Vantagem aos aliados no próximo ataque. Falha: O Núcleo domina e realiza um ataque extra usando as habilidades do personagem.",
      "Colapso da Caverna: 15 PM. O núcleo puxa o teto. Causa 15 de dano de Terra em área."
    ],
    equipment: []
  }
]