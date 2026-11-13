import type { ArenaPortrait,ArenaPublicFighter,ArenaSession } from './model'
import {basicAttackRange} from './geometry'
export const ARENA_STAGES = [
 {id:'forest',name:'Santuário Verde',region:'Floresta ancestral',color:'#64d5b4',image:'/arena/stages/forest-v15.webp'},
 {id:'harbor',name:'Porto das Marés',region:'Porto de pesca',color:'#efbd76',image:'/arena/stages/harbor-v15.webp'},
 {id:'egypt',name:'Trono do Sol',region:'Cidade egípcia',color:'#f3ce86',image:'/arena/stages/egypt-v15.webp'},
 {id:'swamp',name:'Pântano do Eclipse',region:'Pântano sombrio',color:'#b19cdf',image:'/arena/stages/swamp-v15.webp'},
] as const
type Entry=[string,string,string,string,string,number,string[],string[]]
const entries:Entry[]=[
 ['fander','Fander','O filho do raio','#6bc8ff','a',0,['Lampejo destruidor','Deus do trovão','Quebra nariz'],['Avance envolto em eletricidade.','Chifres azuis, dano e velocidade ampliados por 6 segundos.','Avança com uma cotovelada carregada de relâmpagos.']],
 ['andreas','Andreas','O andarilho da penumbra','#b195df','a',1,['Passo entre sombras','União das sombras: Canis','Caixão de gravidade umbral'],['Velocidade ampliada por 6 segundos.','Duas sombras perseguem o adversário.','Atrai inimigos para o centro do campo.']],
 ['lightea','Lightea','A sonhadora ambiciosa','#ddd6ff','a',2,['Dança inebriante das pétalas','Dama da centelha da morte'],['Desvia automaticamente por 3 segundos.','Mãos negras emergem do chão, ferem e prendem adversários.']],
 ['maeve','Maeve','A leoa da sala vermelha','#ff9369','a',3,['Calidus brachium','Julgamento do sol'],['Incendeia as mãos e fortalece golpes por 6 segundos.','Lança uma esfera de fogo.']],
 ['joffrey','Joffrey','O marionetista carmesim','#f091ae','b',0,['Gaiola de seda pálida','Chicotada de seda','Tempestade de fios rubros'],['Mover-se dentro da gaiola causa dano.','Ataque de longo alcance.','Um ciclone de fios persegue o oponente.']],
 ['valya','Valya','A soberana do inverno','#90e4f7','b',1,['Parede do vento gélido','0 absoluto','Cicatriz gélida'],['Projeta uma parede de gelo.','Causa dano e congela por instantes.','Invoca um dragão de gelo que avança até o alvo, causa dano e se desfaz.']],
 ['miguel','Miguel','O vingador branco','#f2ada1','b',2,['Susanoo','Fios do destino','Vórtice de fios'],['Controle a marionete por 6 segundos; use de novo para voltar.','Chicote de longo alcance.','Uma barreira repele adversários.']],
 ['amelia','Amélia','A descendente de akasha','#9fda9b','b',3,['Laços florestais','Segunda primavera · passiva'],['Lança cinco raízes em sequência.','Retorna com 45 de vida uma vez por partida.']],
 ['lysa','Lysa','A hospedeira do vazio','#a4c1a5','c',3,['Deslize parasitário','Imergir nas sombras','Boa noite, pequena'],['Mãos negras imobilizam o alvo.','Mova-se como uma poça; pule ou ataque para emergir.','Engole um inimigo próximo e o cospe.']],
 ['thorfinn','Thorfinn','O senhor do sangue','#fa7c87','c',0,['Mil agulhas de sangue','Garras escarlates','Ímpeto rubro'],['Dispara três agulhas de sangue.','Avança com as garras.','Amplia velocidade e dano por 6 segundos.']],
 ['loulan','Loulan','A beleza tóxica','#a9c7f1','c',1,['Caçada sombria','Clarão celestial','Lâminas purpuras'],['A corrente puxa o alvo.','Um disparo rápido e preciso.','Alterna a arma: kunai +10% de velocidade; karambit +18% de dano. Sem acumular.']],
 ['langris','Langris','O peso do infinito','#bf9bff','c',2,['Convergência','Divergência','Vórtice de Ruptura'],['Campo gravitacional que atrai.','Repele adversários próximos.','Lança uma esfera de gravidade.']],
]
export const ARENA_CAST:ArenaPortrait[]=entries.map(([id,name,title,color,atlas,row,names,descriptions])=>({
 id,name,title,color,kind:'player',imageUrl:`/arena/portraits/${id}${['amelia','lysa','loulan'].includes(id)?'-v10':''}.webp`,spriteUrl:`/arena/sprites/fighters-${atlas}.webp`,spriteRow:row,
 speed:id==='loulan'?245:225,power:10,weaponStyle:'fists',techniques:names.map((name,index)=>({name,description:descriptions[index],passive:id==='amelia'&&index===1})),
 moves:[{kind:'light',name:'Soco alto',damage:6,range:basicAttackRange('light'),magic:false,projectile:false},{kind:'heavy',name:'Soco baixo',damage:8,range:basicAttackRange('heavy'),magic:false,projectile:false},{kind:'kick',name:'Chute alto',damage:11,range:basicAttackRange('kick'),magic:false,projectile:false},{kind:'lowKick',name:'Chute baixo',damage:9,range:basicAttackRange('lowKick'),magic:false,projectile:false},{kind:'special',name:names[0],damage:16,range:175,magic:true,projectile:false}]
}))
export const BASE_LYSA=ARENA_CAST.find(p=>p.id==='lysa')!
export const ALTER_LYSA:ArenaPortrait={...BASE_LYSA,name:'Alter Lysa',title:'A herdeira do vazio',color:'#e17d9b',imageUrl:'/arena/portraits/alter-lysa-v11.webp',techniques:[
 {name:'Me concede essa dança?',description:'Dança e lança uma cópia parasitária. Em euforia: golpe com as duas maças.'},
 {name:'Euforia descontrolada',description:'Forma selvagem por 10 segundos: dano +60%. Use de novo para voltar; uma nova transformação exige MP cheio.'},
]}
export function fighterPortrait(roster:readonly ArenaPortrait[],f:Pick<ArenaPublicFighter,'characterId'>&{alterLysa?:boolean}){
 return f.characterId==='lysa'?(f.alterLysa?ALTER_LYSA:BASE_LYSA):roster.find(p=>p.id===f.characterId)
}
/** The public tile changes for everyone; a fighter's actual variant remains per device. */
export function arenaRoster(room:Pick<ArenaSession,'roster'|'phase'|'secretUnlocks'>&{fighters:readonly Pick<ArenaPublicFighter,'alterLysa'|'withdrawn'>[]}):ArenaPortrait[]{
 const show=room.phase==='lobby'||room.phase==='stage'?(room.secretUnlocks||[]).length>0:room.phase!=='finished'&&room.fighters.some(f=>f.alterLysa&&!f.withdrawn)
 return room.roster.map(p=>p.id==='lysa'?{...(show?ALTER_LYSA:BASE_LYSA)}:p)
}
