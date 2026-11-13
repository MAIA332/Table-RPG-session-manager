import {fighterDimensions,basicAttackRange} from './geometry'
import {fighterPortrait} from './catalog'
/** Simulação a 60 Hz, independente das fichas e recursos da campanha. */
export const ARENA_WIDTH=1600,ARENA_HEIGHT=540,ARENA_FLOOR=451,ARENA_MAX_FIGHTERS=4,ROUND_SECONDS=99,ROUNDS_TO_WIN=2,GRAVITY=1740
export const ARENA_EDGE=56,HIT_RECOVERY_GRACE=.08
export const ARENA_SCHEMA_VERSION=13
export type ArenaSettings={roundSeconds:30|60|99|null;mode:'free-for-all'|'teams'}
export const DEFAULT_ARENA_SETTINGS:ArenaSettings={roundSeconds:ROUND_SECONDS,mode:'free-for-all'}
export const arenaSettings=(r:{settings?:ArenaSettings}):ArenaSettings=>r.settings||DEFAULT_ARENA_SETTINGS
export function configureArenaSettings(r:ArenaSession,value:unknown){
 if(r.phase!=='lobby')throw new Error('As configurações só podem mudar na seleção de personagens.')
 if(!value||typeof value!=='object')throw new Error('Configurações inválidas.')
 const {roundSeconds,mode}=value as ArenaSettings
 if(roundSeconds!==null&&roundSeconds!==30&&roundSeconds!==60&&roundSeconds!==99)throw new Error('Escolha 30, 60, 99 segundos ou infinito.')
 if(mode!=='free-for-all'&&mode!=='teams')throw new Error('Modo de partida inválido.')
 if(mode==='teams'&&(r.fighters.length!==4||r.fighters.some(f=>f.withdrawn)))throw new Error('Em equipe exige quatro participantes.')
 r.settings={roundSeconds,mode}
}
export const arenaTeam=(r:{fighters:readonly{id:string;team?:0|1}[]},f:{id:string;team?:0|1;slot?:number})=>f.team??(f.slot??Math.max(0,r.fighters.findIndex(e=>e.id===f.id)))%2
export const arenaOpponents=(r:{settings?:ArenaSettings;fighters:readonly{id:string;team?:0|1}[]},a:{id:string;team?:0|1},b:{id:string;team?:0|1})=>a.id!==b.id&&(arenaSettings(r).mode!=='teams'||arenaTeam(r,a)!==arenaTeam(r,b))
export const EUPHORIA_TRANSFORM_SECONDS=2.1,EUPHORIA_REVERT_SECONDS=1.1,EUPHORIA_SECONDS=10,EUPHORIA_DAMAGE=1.6,EUPHORIA_DRAIN=0,ALTER_DANCE_SECONDS=2.4,JUMP_SPEED=830,AIR_MOVE_MULTIPLIER=1.4,DIZZY_SECONDS=1.8
export const ARENA_GO_CLEAR_SECONDS=.12
const STEP=1/60
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
export type MoveKind='light'|'heavy'|'kick'|'lowKick'|'special'
export type ArenaMove={kind:MoveKind;name:string;damage:number;range:number;magic:boolean;projectile:boolean}
export type ArenaPortrait={id:string;name:string;imageUrl:string;kind:'player'|'npc'|'monster';ownerId?:string;moves:ArenaMove[];speed:number;power:number;weaponStyle?:'blade'|'staff'|'bow'|'fists';title?:string;color?:string;spriteUrl?:string;spriteRow?:number;techniques?:{name:string;description:string;passive?:boolean}[]}
export type ArenaInput={left:boolean;right:boolean;jump:boolean;light:boolean;heavy:boolean;kick:boolean;lowKick:boolean;special:boolean;special2:boolean;special3:boolean;guard:boolean;dodge:boolean;crouch:boolean}
export const NO_INPUT:ArenaInput={left:false,right:false,jump:false,light:false,heavy:false,kick:false,lowKick:false,special:false,special2:false,special3:false,guard:false,dodge:false,crouch:false}
export const ATTACK_BUTTONS=['special3','special2','special','kick','lowKick','heavy','light'] as const
export const PULSE_BUTTONS=['jump',...ATTACK_BUTTONS,'dodge'] as const
export type FighterPose='idle'|'walk'|'jump'|'crouch'|'guard'|'dash'|'light'|'heavy'|'special'|'hit'|'ko'|'win'|'kick'|'lowKick'
export type ArenaBox={x:number;y:number;w:number;h:number}
export const intersectsAABB=(a:ArenaBox,b:ArenaBox)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y
export type DirectionSample={direction:number;at:number}
export type ArenaFighter={
 id:string;userId:string;device:string;name:string;characterId:string|null;bot:boolean;withdrawn:boolean;team?:0|1;slot?:number;botOwnerId?:string;autoBot?:boolean
 x:number;y:number;vx:number;vy:number;facing:number;onGround:boolean;health:number;guard:number;meter:number;wins:number;combo:number;comboUntil:number
 pose:FighterPose;poseUntil:number;invincibleUntil:number;stunUntil:number;dodgeUntil:number
 attackKind:MoveKind|null;attackAt:number;attackUntil:number;attackHit:boolean;attackTargets:string[];attackCooldownUntil:number;comboStep:number;chainUntil:number;bufferKind:MoveKind|null;bufferUntil:number;airJumps:number
 chainKind:MoveKind|null;chainPose:MoveKind|null
 hitStreak:number;hitStreakUntil:number;hitStreakBy:string|null;dizzyUntil:number;grabUntil:number;grabbedBy:string|null;grabbedUntil:number;knockdownUntil:number;getupAt:number;recoilUntil:number
 lastHitBy:string|null;input:ArenaInput;lastSeen:number;lastInputSeq:number;lastInputSource:string;previousJump:boolean;previousLight:boolean;previousHeavy:boolean;previousSpecial:boolean;previousDodge:boolean
 previousButtons:ArenaInput;directions:DirectionSample[];motionFacing:number;specialIndex:number;bufferSpecial:number;directional:boolean;activeTechnique:string
 lastPulseCounts:Partial<Record<keyof ArenaInput,number>>;pendingPulses:Partial<ArenaInput>
 buffUntil:number;buffKind:string;autoDodgeUntil:number;frozenUntil:number;rootUntil:number;puppetUntil:number;puppetX:number;puddleUntil:number;swallowedUntil:number;swallowedBy:string|null;revived:boolean;weapon:'kunai'|'karambit'
 alterLysa:boolean;euphoriaState:'normal'|'transforming'|'active'|'reverting';euphoriaAt:number;euphoriaNeedsFull:boolean;euphoriaBurst:boolean;danceAt:number;danceUntil:number;danceLaunched:boolean
}
export type ArenaProjectile={id:number;ownerId:string;x:number;y:number;vx:number;damage:number;expiresAt:number;magic:boolean;style?:string;targetId?:string;launchAt?:number;radius?:number}
export type ArenaZone={id:number;ownerId:string;kind:'darkness'|'cage'|'blizzard'|'barrier'|'roots'|'fate'|'gravity';x:number;radius:number;expiresAt:number;nextHit:number;targetId?:string;anchorX?:number}
export type ArenaEffect={id:number;x:number;y:number;kind:'hit'|'guard'|'burst'|'ko'|'dust'|'skill';expiresAt:number;power?:number;facing?:number;style?:string}
export type ArenaSession={
 schemaVersion?:number;revision?:number
 settings?:ArenaSettings;winningTeam?:0|1|null
 secretUnlocks?:{userId:string;device:string}[]
 id:string;campaignId:string;phase:'lobby'|'stage'|'playing'|'paused'|'finished';createdAt:number;gmId:string;stageId:string
 roster:ArenaPortrait[];fighters:ArenaFighter[];winnerId:string|null;pausedBy:string|null;tickAt:number;accumulator:number;gameTime:number;roundElapsed:number;rounds:number;roundStatus:'intro'|'fight'|'ko'
 nextRoundAt:number;message:string;lastUpdateAt:number;projectiles:ArenaProjectile[];zones:ArenaZone[];effects:ArenaEffect[];effectSequence:number;hitstopFrames?:number
}
type PrivateFighter='input'|'lastSeen'|'lastInputSeq'|'lastInputSource'|'lastPulseCounts'|'pendingPulses'|'previousJump'|'previousLight'|'previousHeavy'|'previousSpecial'|'previousDodge'|'previousButtons'|'directions'|'motionFacing'|'bufferKind'|'bufferUntil'|'bufferSpecial'|'attackTargets'
export type ArenaPublicFighter=Omit<ArenaFighter,PrivateFighter>
export type ArenaSnapshot=Omit<ArenaSession,'fighters'> & {fighters:ArenaPublicFighter[]}
export const spawnX=(i:number)=>[600,1000,360,1240][i]??800
const alive=(f:ArenaFighter)=>!f.withdrawn&&f.health>0
const nearest=(r:ArenaSession,f:ArenaFighter)=>{const x=f.puppetUntil>r.gameTime?f.puppetX:f.x;return r.fighters.filter(e=>arenaOpponents(r,f,e)&&alive(e)&&e.swallowedUntil<=r.gameTime&&e.puddleUntil<=r.gameTime).sort((a,b)=>Math.hypot(a.x-x,a.y-f.y)-Math.hypot(b.x-x,b.y-f.y)||a.id.localeCompare(b.id))[0]}
const character=(r:ArenaSession,f:ArenaFighter)=>fighterPortrait(r.roster,f)
const origin=(f:ArenaFighter,t:number)=>f.puppetUntil>t?f.puppetX:f.x
export function getFighterHurtbox(f:Pick<ArenaFighter,'x'|'y'|'pose'>&{characterId?:string|null;alterLysa?:boolean;euphoriaState?:string}):ArenaBox {
 const duck=f.pose==='crouch',ko=f.pose==='ko',body=fighterDimensions(f.characterId),height=ko?30:body.height*(duck?.52:.94),width=ko?84:body.width
 return {x:f.x-width/2,y:f.y-height,w:width,h:height-4}
}
export function getAttackHitbox(f:Pick<ArenaFighter,'x'|'y'|'facing'|'attackKind'|'attackAt'|'attackUntil'|'comboStep'|'onGround'>&{characterId?:string|null;puppetUntil?:number;alterLysa?:boolean;euphoriaState?:string},at:number,range?:number):ArenaBox|null {
 const k=f.attackKind;if(!k||at>=f.attackUntil)return null
 const startup=attackTiming(k).startup
 if(at-f.attackAt<startup||at-f.attackAt>startup+.14)return null
 const low=k==='heavy'||k==='lowKick',euphoric=f.alterLysa&&f.euphoriaState==='active',height=fighterDimensions(f.characterId).height*((f.puppetUntil||0)>at?1.45:1),w=clamp((range??basicAttackRange(k))*height/190*(euphoric?1.25:1),50,340)
 return {x:f.facing===1?f.x:f.x-w,y:f.y-height*(low?.48:.88),w,h:height*(low?.46:.62)}
}
export function attackTiming(kind:MoveKind){
 return kind==='special'?{duration:.66,startup:.28}:kind==='kick'?{duration:.42,startup:.18}:kind==='lowKick'?{duration:.38,startup:.16}:kind==='heavy'?{duration:.36,startup:.14}:{duration:.32,startup:.12}
}
export function getProjectileHitbox(p:Pick<ArenaProjectile,'x'|'y'|'radius'>&{style?:string}):ArenaBox {if(p.style==='alterClone')return{x:p.x-27,y:p.y-165,w:54,h:165};if(p.style==='iceDragon')return{x:p.x-115,y:p.y-65,w:230,h:135};const v=p.radius||17;return{x:p.x-v,y:p.y-v,w:v*2,h:v*2}}
/** 236 / 214 relativos ao lado do lutador; direções neutras são toleradas. */
export function recognizeMotion(samples:readonly DirectionSample[],facing:number,now:number):'forward'|'back'|null {
 const recent=samples.filter(s=>now-s.at<=.48&&s.direction!==5)
 for(const [name,seq] of [['forward',facing===1?[2,3,6]:[2,1,4]],['back',facing===1?[2,1,4]:[2,3,6]]] as const){
  let j=2;for(let i=recent.length-1;i>=0&&j>=0;i--)if(recent[i].direction===seq[j])j--
  if(j<0&&recent.at(-1)?.direction===seq[2])return name
 }return null
}
function setupFighter(f:ArenaFighter,index:number){
 Object.assign(f,{x:spawnX(index),y:ARENA_FLOOR,vx:0,vy:0,facing:index%2?-1:1,onGround:true,health:100,guard:100,meter:70,combo:0,comboUntil:0,pose:'idle',poseUntil:0,
 invincibleUntil:0,stunUntil:0,dodgeUntil:0,attackKind:null,attackAt:0,attackUntil:0,attackHit:false,attackTargets:[],attackCooldownUntil:0,comboStep:0,chainUntil:0,chainKind:null,chainPose:null,hitStreak:0,hitStreakUntil:0,hitStreakBy:null,dizzyUntil:0,grabUntil:0,grabbedBy:null,grabbedUntil:0,knockdownUntil:0,getupAt:0,recoilUntil:0,bufferKind:null,bufferUntil:0,bufferSpecial:0,airJumps:0,
 lastHitBy:null,input:{...NO_INPUT},previousButtons:{...NO_INPUT},directions:[],motionFacing:index%2?-1:1,lastInputSeq:f.lastInputSeq||0,lastInputSource:f.lastInputSource||'',lastPulseCounts:f.lastPulseCounts||{},pendingPulses:{},previousJump:false,previousLight:false,previousHeavy:false,previousSpecial:false,previousDodge:false,
 specialIndex:0,directional:false,activeTechnique:'',buffUntil:0,buffKind:'',autoDodgeUntil:0,frozenUntil:0,rootUntil:0,puppetUntil:0,puppetX:spawnX(index),puddleUntil:0,swallowedUntil:0,swallowedBy:null,weapon:'kunai',euphoriaState:'normal',euphoriaAt:0,euphoriaNeedsFull:false,euphoriaBurst:false,danceAt:0,danceUntil:0,danceLaunched:false})
}
export function newFighter(id:string,userId:string,device:string,name:string,bot=false):ArenaFighter {
 const f={id,userId,device,name,characterId:null,bot,withdrawn:false,wins:0,lastSeen:Date.now(),revived:false,alterLysa:false} as ArenaFighter
 setupFighter(f,0);return f
}
function initRound(r:ArenaSession){
 r.roundElapsed=0;r.rounds++;r.roundStatus='intro';r.nextRoundAt=r.gameTime+2.6;r.projectiles=[];r.effects=[];r.zones=[];r.hitstopFrames=0;r.message='ROUND '+r.rounds
 r.fighters.forEach((f,i)=>{if(!f.withdrawn)setupFighter(f,f.slot??i)})
}
export function startRound(r:ArenaSession){
 if(arenaSettings(r).mode==='teams'&&(r.fighters.length!==4||r.fighters.some(f=>f.withdrawn)))throw new Error('Em equipe exige quatro participantes.')
 r.phase='playing';r.winnerId=null;r.pausedBy=null;r.hitstopFrames=0;r.rounds=0;r.gameTime=0;r.tickAt=Date.now();r.accumulator=0;r.effectSequence=0
 r.winningTeam=null;r.fighters.forEach((f,i)=>{f.team=arenaSettings(r).mode==='teams'?(f.slot??i)%2 as 0|1:undefined;f.wins=0;f.withdrawn=false;f.revived=false});initRound(r)
}
function effect(r:ArenaSession,x:number,y:number,kind:ArenaEffect['kind'],power=1,facing=1,style?:string){
 r.effects.push({id:++r.effectSequence,x,y,kind,power,facing,style,expiresAt:r.gameTime+(kind==='ko'?1:kind==='skill'?.85:kind==='dust'?.3:.4)})
 if(r.effects.length>64)r.effects.shift()
}
export function receiveHit(r:ArenaSession,a:ArenaFighter,b:ArenaFighter,damage:number,magic=false,impactX=b.x,low=false,grab=false){
 const t=r.gameTime
 if(!alive(b)||!arenaOpponents(r,a,b)||b.invincibleUntil>t||b.swallowedUntil>t||b.puddleUntil>t)return false
 const basic=!magic&&!grab&&!!a.attackKind&&a.attackKind!=='special',pushDirection=basic?a.facing:(b.x>=a.x?1:-1)
 if(b.autoDodgeUntil>t){b.invincibleUntil=t+.2;b.dodgeUntil=t+.3;b.poseUntil=t+.3;b.pose='dash';b.vx=-b.facing*260;effect(r,b.x,b.y-90,'skill',1,b.facing,'dodge');return false}
 const guarding=!grab&&b.input.guard&&b.onGround&&!b.attackKind&&b.stunUntil<=t&&b.facing*(a.x-b.x)>0&&(!low||b.input.crouch||b.input.guard)
 const buff=a.buffUntil>t&&['electric','blood','fire'].includes(a.buffKind)?1.28:1
 const amount=guarding?Math.max(1,Math.round(damage*.1)):Math.round(damage*buff*(a.characterId==='loulan'&&a.weapon==='karambit'?1.18:1)*(a.alterLysa&&a.euphoriaState==='active'?EUPHORIA_DAMAGE:1)*(b.alterLysa&&b.euphoriaState==='active'?.82:1))
 b.health=clamp(b.health-amount,0,100);b.lastHitBy=a.id
 a.meter=clamp(a.meter+(guarding?3:10),0,100)
 if(guarding){b.hitStreak=0;b.guard=clamp(b.guard-(magic?17:12),0,100);b.pose=b.guard===0?'hit':'guard';b.stunUntil=t+(b.guard===0?.6:.12);if(basic){b.vx=pushDirection*100;b.recoilUntil=b.stunUntil}effect(r,impactX,b.y-90,'guard',1,a.facing)}
 else{
  a.combo=a.comboUntil>=t?a.combo+1:1;a.comboUntil=t+1.5
  a.hitStreak=0
  b.hitStreak=b.hitStreakUntil>=t&&b.hitStreakBy===a.id?b.hitStreak+1:1;b.hitStreakBy=a.id;b.hitStreakUntil=t+1.5
  if(b.dizzyUntil>t){b.dizzyUntil=0;b.hitStreak=1}
  b.attackKind=null;b.bufferKind=null;b.attackUntil=0;b.chainUntil=0
  b.danceUntil=0
  b.vx=pushDirection*(basic?(a.comboStep===3?360:230)+(a.attackKind==='kick'||a.attackKind==='lowKick'?25:0):(60+damage*4));b.vy=damage>13?-230:-45;b.onGround=false;b.stunUntil=t+clamp(.13+damage*.008,.16,.38);b.pose='hit';b.poseUntil=b.stunUntil
  if(basic)b.recoilUntil=b.stunUntil
  b.invincibleUntil=Math.max(b.invincibleUntil,b.stunUntil+HIT_RECOVERY_GRACE)
  if(b.hitStreak>=8&&b.health>0){b.hitStreak=0;b.dizzyUntil=t+DIZZY_SECONDS;b.stunUntil=b.dizzyUntil;b.invincibleUntil=t+.12;b.vx=0;b.vy=0;b.onGround=b.y>=ARENA_FLOOR}
  if(basic&&a.comboStep===3&&b.health>0){
   b.vx=pushDirection*490;b.vy=-420;b.onGround=false;b.knockdownUntil=t+5;b.getupAt=-1;b.recoilUntil=0
   b.invincibleUntil=Math.max(b.invincibleUntil,t+.35)
   if(b.alterLysa&&(b.euphoriaState==='transforming'||b.euphoriaState==='reverting'))b.euphoriaState='normal'
  }
  effect(r,impactX,b.y-94,'hit',clamp(damage/9,.7,2),a.facing);r.hitstopFrames=Math.max(r.hitstopFrames||0,2)
  r.message=a.activeTechnique||'Acerto!'
 }
 if(b.health<=0&&b.characterId==='amelia'&&!b.revived){b.revived=true;b.health=45;b.invincibleUntil=t+1.2;b.stunUntil=t+.2;effect(r,b.x,b.y-70,'skill',2,1,'revive');r.message='AMÉLIA · SEGUNDA PRIMAVERA'}
 else if(b.health<=0){b.pose='ko';b.attackKind=null;b.attackUntil=0;b.vx=pushDirection*(basic?350:damage>13?260:65);b.vy=damage>13?-320:-80;b.onGround=false;effect(r,b.x,b.y-70,'ko',2,b.facing)}
 return true
}
function projectile(r:ArenaSession,f:ArenaFighter,style:string,damage:number,speed=440,delay=0,offset=0){
 r.projectiles.push({id:++r.effectSequence,ownerId:f.id,x:origin(f,r.gameTime)+f.facing*45,y:f.y-(style==='iceDragon'?155:90)+offset,vx:f.facing*speed,damage,magic:true,style,targetId:nearest(r,f)?.id,launchAt:r.gameTime+delay,expiresAt:r.gameTime+delay+(style==='iceDragon'?4:2.1),radius:({iceDragon:76,ice:42,gravity:34,bullet:8,fire:32,shadow:28,tornado:40,root:24,blood:18,chain:18} as Record<string,number>)[style]||20})
}
function zone(r:ArenaSession,f:ArenaFighter,kind:ArenaZone['kind'],x:number,radius:number,duration:number,target?:ArenaFighter){
 r.zones.push({id:++r.effectSequence,ownerId:f.id,kind,x,radius,expiresAt:r.gameTime+duration,nextHit:r.gameTime+.12,targetId:target?.id,anchorX:target?.x})
}
function direct(r:ArenaSession,f:ArenaFighter,damage:number,range:number,push?:number){
 const x=origin(f,r.gameTime)
 // Um golpe direcionado adquire um único alvo; a janela ativa não troca de vítima.
 if(f.attackTargets.length)return
 const e=r.fighters.filter(e=>arenaOpponents(r,f,e)&&alive(e)&&e.swallowedUntil<=r.gameTime&&e.puddleUntil<=r.gameTime&&Math.abs(e.x-x)<range&&Math.abs(e.y-f.y)<150&&f.facing*(e.x-x)>-25).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x)||a.id.localeCompare(b.id))[0]
 if(e&&receiveHit(r,f,e,damage,true,e.x)){f.attackTargets.push(e.id);if(push)e.vx=push*f.facing}
}
function cast(r:ArenaSession,f:ArenaFighter){
 const t=r.gameTime,n=f.specialIndex,id=f.characterId,e=nearest(r,f),buff=(kind:string)=>{f.buffKind=kind;f.buffUntil=t+6}
 if(f.alterLysa){if(f.euphoriaState==='active'&&n===0)direct(r,f,22,225,420);return}
 effect(r,origin(f,t),f.y-85,'skill',1.5,f.facing,id+':'+n)
 if(id==='fander'){if(n===0){f.vx=f.facing*650;direct(r,f,17,210)}else if(n===1)buff('electric');else{f.vx=f.facing*720;direct(r,f,18,155)}}
 else if(id==='andreas'){if(n===0)buff('shadow');else if(n===1){projectile(r,f,'shadow',9,290);projectile(r,f,'shadow',9,330,.24,-12)}else zone(r,f,'darkness',f.x,245,3)}
 else if(id==='lightea'){if(n===0){f.autoDodgeUntil=t+3;f.invincibleUntil=t+.3}else zone(r,f,'fate',e?.x??f.x+f.facing*180,125,3)}
 else if(id==='maeve'){if(n===0)buff('fire');else projectile(r,f,'fire',17,450)}
 else if(id==='joffrey'){if(n===0&&e)zone(r,f,'cage',e.x,62,3.8,e);else if(n===1)direct(r,f,15,285);else projectile(r,f,'tornado',17,250)}
 else if(id==='valya'){if(n===0)projectile(r,f,'ice',14,280);else if(n===1)zone(r,f,'blizzard',e?.x??f.x+f.facing*180,185,4.5);else projectile(r,f,'iceDragon',22,380,.14)}
 else if(id==='miguel'){if(n===0){f.puppetUntil=f.puppetUntil>t?0:t+6;f.puppetX=f.x+f.facing*115}else if(n===1)direct(r,f,14,290);else zone(r,f,'barrier',f.x,175,2.5)}
 else if(id==='amelia'){for(let i=0;i<5;i++)projectile(r,f,'root',4,380,i*.12,(i-2)*15)}
 else if(id==='thorfinn'){if(n===0)for(let i=0;i<3;i++)projectile(r,f,'blood',6,570,i*.07,(i-1)*19);else if(n===1){f.vx=f.facing*680;direct(r,f,18,215)}else buff('blood')}
 else if(id==='loulan'){if(n===0)projectile(r,f,'chain',10,560);else if(n===1)projectile(r,f,'bullet',13,960);else{effect(r,f.x,f.y-80,'skill',1,f.facing,'weapon:'+f.weapon);r.message='LOULAN · '+(f.weapon==='kunai'?'KUNAI · VELOCIDADE +10%':'KARAMBIT · DANO +18%')}}
 else if(id==='langris'){if(n===0)zone(r,f,'gravity',f.x+f.facing*100,300,2);else if(n===1){direct(r,f,13,340,750);effect(r,f.x,f.y-75,'skill',3,f.facing,'repulse')}else projectile(r,f,'gravity',20,340)}
 else if(id==='lysa'){
  if(n===0)zone(r,f,'roots',e?.x??f.x+f.facing*160,105,3)
  else if(n===1){f.puddleUntil=t+3;f.invincibleUntil=t+.15}
  else if(e&&Math.abs(e.x-f.x)<145&&e.invincibleUntil<=t&&e.autoDodgeUntil<=t){e.swallowedUntil=t+1.6;e.swallowedBy=f.id;e.attackKind=null;e.vx=0;e.vy=0;e.input={...NO_INPUT};effect(r,f.x,f.y-100,'skill',2,f.facing,'devour')}
 }
}
function startAttack(r:ArenaSession,f:ArenaFighter,kind:MoveKind){
 const t=r.gameTime
 const requested=kind,linked=kind!=='special'&&f.chainKind!==null&&f.chainUntil>=t
 const attackDirection=Number(f.input.right)-Number(f.input.left);if(attackDirection)f.facing=attackDirection>0?1:-1
 if(kind!=='special'){
  const punches=kind==='light'||kind==='heavy',sameFamily=f.chainKind&&(punches?(f.chainKind==='light'||f.chainKind==='heavy'):(f.chainKind==='kick'||f.chainKind==='lowKick'))
  f.comboStep=linked?(f.comboStep%3)+1:1
  if(f.comboStep>1&&sameFamily&&!f.input.crouch)kind=f.chainPose==='light'?'heavy':f.chainPose==='heavy'?'light':f.chainPose==='kick'?'lowKick':'kick'
  f.chainKind=requested;f.chainPose=kind
 }else{f.comboStep=0;f.chainKind=null;f.chainPose=null}
 if(f.alterLysa&&kind==='special'&&f.bufferSpecial>=1){
  if(!f.onGround||f.euphoriaState==='transforming'||f.euphoriaState==='reverting')return false
  const leaving=f.euphoriaState==='active'
  if(!leaving&&(f.meter<20||f.euphoriaNeedsFull&&f.meter<99.999))return false
  if(!leaving)f.meter-=20
  f.euphoriaState=leaving?'reverting':'transforming';f.euphoriaAt=t;f.euphoriaBurst=false
  if(leaving)f.euphoriaNeedsFull=true
  f.specialIndex=1;f.activeTechnique='Euforia descontrolada';f.attackAt=t;f.attackKind=null;f.bufferKind=null;f.bufferUntil=0;f.danceUntil=0;f.vx=0;f.pose='special'
  f.attackCooldownUntil=t+(leaving?EUPHORIA_REVERT_SECONDS:EUPHORIA_TRANSFORM_SECONDS);return true
 }
 if(kind==='special'){
  const techniques=character(r,f)?.techniques?.filter(s=>!s.passive)||[]
  f.specialIndex=Math.min(Math.max(0,f.bufferSpecial),Math.max(0,techniques.length-1))
  if(f.characterId==='lysa'&&!f.alterLysa&&f.specialIndex===1&&f.puddleUntil>t){f.bufferKind=null;f.bufferUntil=0;return false}
  const cost=f.characterId==='loulan'&&f.specialIndex===2?0:f.alterLysa&&f.euphoriaState==='active'?8:25;if(f.meter<cost)return false
  f.meter-=cost;f.activeTechnique=techniques[f.specialIndex]?.name||'Especial'
  if(f.characterId==='loulan'&&f.specialIndex===2)f.weapon=f.weapon==='kunai'?'karambit':'kunai'
 }else f.activeTechnique=character(r,f)?.moves.find(m=>m.kind===kind)?.name||kind
 f.attackKind=kind;f.attackAt=t;f.attackHit=false;f.attackTargets=[]
 f.attackUntil=t+attackTiming(kind).duration;f.attackCooldownUntil=f.attackUntil+.025;f.chainUntil=f.attackUntil+.55
 if(f.alterLysa&&kind==='special'&&f.specialIndex===0&&f.euphoriaState==='normal'){
  f.danceAt=t;f.danceUntil=t+ALTER_DANCE_SECONDS;f.danceLaunched=false;f.attackUntil=f.danceUntil;f.attackCooldownUntil=f.attackUntil+.12
 }
 f.pose=kind;f.poseUntil=f.attackUntil;f.vx=kind!=='special'&&f.onGround&&f.puppetUntil<=t?f.facing*(linked?100:50):f.vx*.25;f.bufferKind=null;f.bufferUntil=0;f.puddleUntil=0
 if(kind==='special')r.message=character(r,f)?.name+' · '+f.activeTechnique
 return true
}
function strike(r:ArenaSession,f:ArenaFighter){
 if(!f.attackKind)return
 if(f.attackKind==='special'){
  if(!f.attackHit){cast(r,f);f.attackHit=true}
  if(r.gameTime-f.attackAt<=attackTiming('special').startup+.14){
   if(f.characterId==='fander'&&f.specialIndex!==1)direct(r,f,f.specialIndex===2?18:17,f.specialIndex===2?155:210)
   else if(f.characterId==='thorfinn'&&f.specialIndex===1)direct(r,f,18,215)
  }return
 }
 const move=character(r,f)?.moves.find(m=>m.kind===f.attackKind),x=origin(f,r.gameTime),box=getAttackHitbox({...f,x},r.gameTime,(move?.range||basicAttackRange(f.attackKind))+(f.directional?25:0));if(!box)return
 for(const e of r.fighters)if(e.id!==f.id&&!f.attackTargets.includes(e.id)&&intersectsAABB(box,getFighterHurtbox(e))){if(receiveHit(r,f,e,(move?.damage||7)+(f.directional?2:0)+(f.comboStep===3?3:0),false,e.x,f.attackKind==='heavy'||f.attackKind==='lowKick')){f.attackTargets.push(e.id);f.attackHit=true}}
 if(f.directional&&f.onGround&&f.puppetUntil<=r.gameTime)f.vx=f.facing*170
}
function botInput(f:ArenaFighter,r:ArenaSession):ArenaInput{
 const e=nearest(r,f);if(!e)return {...NO_INPUT}
 const beat=Math.floor(r.gameTime*5),dx=e.x-f.x,near=Math.abs(dx)<110,defend=!!e.attackKind&&near&&beat%3===0
 return {...NO_INPUT,left:!defend&&dx< -87,right:!defend&&dx>87,guard:defend,jump:Math.abs(dx)>170&&beat%17===3,light:near&&beat%4===0,kick:near&&beat%7===2,lowKick:near&&beat%11===5,special:f.meter>=25&&beat%19===7,special2:f.meter>=25&&beat%23===9,special3:f.meter>=25&&beat%29===11,crouch:defend&&beat%2===0}
}
function updateZones(r:ArenaSession,dt:number){
 const t=r.gameTime
 for(const z of r.zones){
  const owner=r.fighters.find(f=>f.id===z.ownerId);if(!owner||!alive(owner)){z.expiresAt=t;continue}
  const pulse=t>=z.nextHit
  for(const e of r.fighters){
   if(!arenaOpponents(r,owner,e)||!alive(e)||Math.abs(e.x-z.x)>z.radius||e.swallowedUntil>t||e.puddleUntil>t)continue
   if((z.kind==='roots'||z.kind==='fate')&&e.y<ARENA_FLOOR-90)continue
   if(z.kind==='gravity'||z.kind==='darkness'){if(e.invincibleUntil<=t)e.x+=Math.sign(z.x-e.x)*Math.min(Math.abs(z.x-e.x),130*dt);if(pulse)receiveHit(r,owner,e,2,true,e.x)}
   else if(z.kind==='cage'&&e.id===z.targetId){if(pulse&&Math.abs(e.x-(z.anchorX??e.x))>6){receiveHit(r,owner,e,4,true,e.x);z.anchorX=e.x}}
   else if(z.kind==='blizzard'&&pulse){if(receiveHit(r,owner,e,3,true,e.x))e.frozenUntil=t+.35}
   else if((z.kind==='roots'||z.kind==='fate')&&pulse){if(receiveHit(r,owner,e,z.kind==='fate'?5:3,true,e.x)){e.rootUntil=t+.6;effect(r,e.x,e.y-30,'skill',1,e.facing,z.kind==='fate'?'fateHands':'hands')}}
   else if(z.kind==='barrier'){e.vx=(e.x>=z.x?1:-1)*500;e.x+=Math.sign(e.x-z.x)*120*dt;if(pulse)receiveHit(r,owner,e,3,true,e.x)}
  }if(pulse)z.nextHit=t+(z.kind==='cage'?.22:.55)
 }r.zones=r.zones.filter(z=>z.expiresAt>t)
}
function concludeRound(r:ArenaSession){
 if(r.fighters.some(f=>f.grabbedBy))return
 const present=r.fighters.filter(f=>!f.withdrawn);if(present.length<2)return
 const living=present.filter(alive),settings=arenaSettings(r),expired=settings.roundSeconds!==null&&r.roundElapsed>=settings.roundSeconds
 if(settings.mode==='teams'){
  const teams=[0,1].map(team=>({team:team as 0|1,members:present.filter(f=>arenaTeam(r,f)===team)})),livingTeams=teams.filter(team=>team.members.some(alive))
  if(livingTeams.length>1&&!expired)return
  const scores=teams.map(team=>({...team,health:team.members.reduce((n,f)=>n+f.health,0)})).sort((a,b)=>b.health-a.health)
  const winners=livingTeams.length===1?livingTeams[0]:scores[0].health!==scores[1].health?scores[0]:null
  if(winners){for(const f of winners.members)f.wins++;const representative=[...winners.members].sort((a,b)=>b.health-a.health)[0];if(representative?.wins>=ROUNDS_TO_WIN){r.winnerId=representative.id;r.winningTeam=winners.team}}
  r.roundStatus='ko';r.nextRoundAt=r.gameTime+2.3;r.message=winners?'EQUIPE '+(winners.team===0?'AZUL':'VERMELHA')+' venceu a rodada':'EMPATE';return
 }
 if(living.length>1&&!expired)return
 const ranked=[...present].sort((a,b)=>b.health-a.health),winner=living.length===1?living[0]:ranked[0].health!==ranked[1].health?ranked[0]:null
 if(winner)winner.wins++
 r.roundStatus='ko';r.nextRoundAt=r.gameTime+2.3;r.message=winner?character(r,winner)?.name+' venceu a rodada':'EMPATE'
 if(winner&&winner.wins>=ROUNDS_TO_WIN)r.winnerId=winner.id
}
function advanceFallen(f:ArenaFighter,dt:number){
 if(f.withdrawn||f.health>0)return
 f.pose='ko';f.vy=Math.min(1000,f.vy+GRAVITY*dt);f.x=clamp(f.x+f.vx*dt,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE);f.y=Math.min(ARENA_FLOOR,f.y+f.vy*dt)
 if(f.y>=ARENA_FLOOR){f.onGround=true;f.vy=0;f.vx*=Math.exp(-dt*9)}
}
function updateAlterLysa(r:ArenaSession,f:ArenaFighter,dt:number){
 if(!f.alterLysa)return false
 const t=r.gameTime,elapsed=t-f.euphoriaAt
 if(f.euphoriaState==='transforming'){
  if(elapsed>=.75&&!f.euphoriaBurst){
   f.euphoriaBurst=true;effect(r,f.x,f.y-95,'burst',2,f.facing,'alterBurst')
   for(const e of r.fighters)if(arenaOpponents(r,f,e)&&alive(e)&&e.swallowedUntil<=t&&e.puddleUntil<=t&&Math.hypot(e.x-f.x,(e.y-f.y)*.8)<155){
    receiveHit(r,f,e,8,true,e.x);e.vx=(e.x>=f.x?1:-1)*680;e.vy=-270;e.onGround=false;e.stunUntil=Math.max(e.stunUntil,t+.34)
   }
  }
  if(elapsed>=EUPHORIA_TRANSFORM_SECONDS){f.euphoriaState='active';f.euphoriaAt=t;f.pose='idle'}
 }else if(f.euphoriaState==='reverting'&&elapsed>=EUPHORIA_REVERT_SECONDS){f.euphoriaState='normal';f.euphoriaAt=t;f.pose='idle'}
 if(f.euphoriaState==='active'){
  if(elapsed>=EUPHORIA_SECONDS){f.euphoriaState='reverting';f.euphoriaAt=t;f.euphoriaNeedsFull=true;f.attackKind=null;f.danceUntil=0;if(f.knockdownUntil<=t)f.vx=0}
 }
 if(f.danceUntil>0&&!f.danceLaunched&&t>=f.danceUntil){
  f.danceLaunched=true
  r.projectiles.push({id:++r.effectSequence,ownerId:f.id,x:clamp(f.x+f.facing*65,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE),y:ARENA_FLOOR,vx:f.facing*180,damage:22,magic:true,style:'alterClone',targetId:nearest(r,f)?.id,launchAt:t,expiresAt:t+10,radius:27})
 }
 return f.knockdownUntil<=t&&(f.euphoriaState==='transforming'||f.euphoriaState==='reverting'||f.danceUntil>t)
}
function step(r:ArenaSession,dt:number){
 if((r.hitstopFrames||0)>0){r.hitstopFrames=(r.hitstopFrames||0)-1;return}
 r.gameTime+=dt;const t=r.gameTime
 if(r.roundStatus==='intro'){for(const f of r.fighters){f.pendingPulses={};f.bufferKind=null;f.bufferUntil=0;f.previousButtons={...f.input};f.previousJump=f.input.jump;f.previousDodge=f.input.dodge}const remaining=r.nextRoundAt-t;r.message=remaining<=ARENA_GO_CLEAR_SECONDS?'':remaining<=.8?'LUTEM!':'ROUND '+r.rounds;if(t>=r.nextRoundAt){r.roundStatus='fight';r.message=''}return}
 if(r.roundStatus==='ko'){
  r.fighters.forEach(f=>advanceFallen(f,dt))
  if(t>=r.nextRoundAt){const winner=r.fighters.find(f=>f.id===r.winnerId);if(winner&&winner.wins>=ROUNDS_TO_WIN){r.phase='finished';winner.pose='win';r.message=''}else initRound(r)}return
 }
 r.roundElapsed+=dt;r.effects=r.effects.filter(e=>e.expiresAt>t)
 for(const f of r.fighters){
  if(f.grabbedBy){
   const holder=r.fighters.find(e=>e.id===f.grabbedBy&&alive(e))
   if(holder&&f.grabbedUntil>t){const progress=clamp(1-(f.grabbedUntil-t)/.18,0,1);f.x=clamp(holder.x+holder.facing*58*Math.cos(progress*Math.PI),ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE);f.y=holder.y-18-Math.sin(progress*Math.PI/2)*155;f.vx=f.vy=0;f.onGround=false;f.pose='hit';f.pendingPulses={};f.bufferKind=null;f.previousButtons={...f.input};continue}
   f.grabbedBy=null;f.grabbedUntil=0
   const throwDirection=-(holder?.facing||f.facing)
   if(holder){f.x=clamp(holder.x+throwDirection*60,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE);f.y=holder.y-170}
   f.vx=throwDirection*440;f.vy=-160;f.onGround=false;f.knockdownUntil=t+.85;f.stunUntil=f.knockdownUntil;f.invincibleUntil=t+.5
  }
  if(!alive(f)){advanceFallen(f,dt);continue}
  if(f.swallowedBy){const caster=r.fighters.find(e=>e.id===f.swallowedBy)
   if(f.swallowedUntil>t&&caster&&alive(caster)){f.x=caster.x;f.y=caster.y;continue}
   f.swallowedBy=null;f.swallowedUntil=0;if(caster){f.x=clamp(caster.x+caster.facing*130,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE);f.invincibleUntil=0;receiveHit(r,caster,f,18,true,f.x);f.vx=caster.facing*580;effect(r,f.x,f.y-100,'skill',1.4,caster.facing,'spit')}
  }
  const input=f.bot?botInput(f,r):{...f.input};if(f.bot)f.input=input
  for(const key of PULSE_BUTTONS)if(f.pendingPulses?.[key]){input[key]=true;f.previousButtons[key]=false;if(key==='jump')f.previousJump=false;if(key==='dodge')f.previousDodge=false}
  f.pendingPulses={}
  if(updateAlterLysa(r,f,dt)){
   f.vx=0;f.bufferKind=null;f.previousJump=input.jump;f.previousDodge=input.dodge;f.previousButtons={...input}
   f.vy=clamp(f.vy+GRAVITY*dt,-750,1000);f.y=Math.min(ARENA_FLOOR,f.y+f.vy*dt);f.onGround=f.y>=ARENA_FLOOR;if(f.onGround)f.vy=0
   continue
  }
  const enemy=nearest(r,f),moving=Number(input.right)-Number(input.left)
  if(input.crouch&&(f.directions.at(-1)?.direction??5)===5)f.motionFacing=f.facing
  if(moving&&!f.attackKind&&f.stunUntil<=t&&f.knockdownUntil<=t&&f.frozenUntil<=t)f.facing=moving>0?1:-1
  else if(f.bot&&enemy&&!f.attackKind&&f.knockdownUntil<=t)f.facing=enemy.x>origin(f,t)?1:-1
  const direction=input.crouch?(moving<0?1:moving>0?3:2):moving<0?4:moving>0?6:5
  if(f.directions.at(-1)?.direction!==direction){f.directions.push({direction,at:t});f.directions=f.directions.filter(s=>t-s.at<.6).slice(-16)}
  let down=ATTACK_BUTTONS.find(key=>input[key]&&!f.previousButtons[key])
  if(down==='lowKick'&&moving&&!input.crouch){
   const active=!!f.attackKind&&t<f.attackUntil
   if(!active&&f.onGround&&f.stunUntil<=t&&f.dizzyUntil<=t&&f.frozenUntil<=t&&t>=f.attackCooldownUntil&&f.puppetUntil<=t&&!input.guard){
    f.facing=moving;f.bufferKind=null;f.chainUntil=0;f.chainKind=null;f.comboStep=0;f.attackKind='heavy';f.attackAt=t;f.attackUntil=t+.48;f.attackCooldownUntil=t+.65;f.pose='heavy';f.poseUntil=f.attackUntil;f.grabUntil=f.attackUntil;f.activeTechnique='Agarrão';f.attackTargets=r.fighters.map(e=>e.id);f.vx=0
    const victim=r.fighters.filter(e=>arenaOpponents(r,f,e)&&alive(e)&&e.onGround&&!e.grabbedBy&&f.facing*(e.x-f.x)>0&&Math.abs(e.x-f.x)<95&&Math.abs(e.y-f.y)<40).sort((a,b)=>Math.abs(a.x-f.x)-Math.abs(b.x-f.x))[0]
    if(victim&&receiveHit(r,f,victim,10,false,victim.x,false,true)){victim.grabbedBy=f.id;victim.grabbedUntil=t+.18;victim.x=clamp(f.x+f.facing*58,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE);victim.y=f.y-18;victim.vx=0;victim.vy=0;victim.onGround=false;victim.stunUntil=t+.6;victim.invincibleUntil=t+.68;effect(r,victim.x,victim.y-90,'burst',1,f.facing)}
   }
   down=undefined
  }
  if(down){
   const motion=down.startsWith('special')?null:recognizeMotion(f.directions,f.motionFacing,t),isSpecial=down.startsWith('special')||!!motion
   f.bufferKind=isSpecial?'special':down as MoveKind;f.bufferSpecial=motion==='back'?1:motion==='forward'?0:down==='special3'?2:down==='special2'?1:0
   f.bufferUntil=t+.5;f.directional=moving===f.facing;if(motion)f.directions=[]
   if(input.crouch&&f.bufferKind==='light')f.bufferKind='heavy'
   if(input.crouch&&f.bufferKind==='kick')f.bufferKind='lowKick'
  }
  if(f.knockdownUntil<=t){f.knockdownUntil=0;f.getupAt=0}
  if(f.knockdownUntil>t&&f.getupAt!==0)f.invincibleUntil=Math.max(f.invincibleUntil,t+.08)
  const dizzy=f.stunUntil>t||f.frozenUntil>t||f.dizzyUntil>t||f.knockdownUntil>t;let active=!!f.attackKind&&t<f.attackUntil
  const cancel=active&&f.comboStep<3&&f.attackKind!=='special'&&f.bufferKind!=='special'&&t>=f.attackAt+attackTiming(f.attackKind!).startup+.14
  if(!dizzy&&!input.guard&&f.bufferKind&&f.bufferUntil>=t&&t>=f.dodgeUntil&&(cancel||!active&&t>=f.attackCooldownUntil))startAttack(r,f,f.bufferKind)
  if(f.alterLysa&&f.knockdownUntil<=t&&(f.euphoriaState==='transforming'||f.euphoriaState==='reverting'||f.danceUntil>t)){f.vx=0;f.previousButtons={...input};continue}
  if(f.bufferUntil<t)f.bufferKind=null;active=!!f.attackKind&&t<f.attackUntil
  const speed=(character(r,f)?.speed||225)*(f.buffUntil>t?1.35:1)*(f.characterId==='loulan'&&f.weapon==='kunai'?1.1:1)*(f.alterLysa&&f.euphoriaState==='active'?1.2:1)
  if(!dizzy&&!active&&t>=f.dodgeUntil){
   if(f.puddleUntil>t){f.vx=moving*430;f.pose='dash';if(input.jump){f.puddleUntil=0;effect(r,f.x,f.y-20,'skill',1,1,'emerge')}}
   else if(f.puppetUntil>t){f.vx=0;f.puppetX=clamp(f.puppetX+moving*speed*dt,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE);f.pose='special'}
   else if(input.guard&&f.onGround){f.vx=0;f.pose='guard'}
   else if(input.crouch&&f.onGround){f.vx=0;f.pose='crouch'}
   else{f.vx=moving*speed*(f.onGround?1:AIR_MOVE_MULTIPLIER);f.pose=moving?(f.onGround?'walk':'jump'):f.onGround?'idle':'jump'}
   if(input.jump&&!f.previousJump&&f.onGround&&!input.guard&&f.puppetUntil<=t){f.puddleUntil=0;f.vy=f.alterLysa&&f.euphoriaState==='active'?-980:-JUMP_SPEED;f.onGround=false;f.vx=moving*speed*AIR_MOVE_MULTIPLIER;f.pose='jump';effect(r,f.x,f.y-5,'dust',1)}
   if(input.dodge&&!f.previousDodge&&f.puppetUntil<=t){const euphoric=f.alterLysa&&f.euphoriaState==='active';f.dodgeUntil=t+(euphoric?.45:.4);f.invincibleUntil=t+.16;f.vx=(moving||f.facing)*(euphoric?930:490);f.pose='dash';f.poseUntil=t+(euphoric?.4:.17)}
  }
  if(f.attackKind){if(t<f.attackUntil){if(t-f.attackAt>=attackTiming(f.attackKind).startup)strike(r,f)}else f.attackKind=null}
  if(dizzy){f.vx*=f.knockdownUntil>t&&!f.onGround?.995:f.recoilUntil>t?.94:.85;if(f.pose!=='guard'||f.guard<=0)f.pose='hit'}if(f.frozenUntil>t||f.rootUntil>t)f.vx=0
  f.previousJump=input.jump;f.previousDodge=input.dodge;f.previousButtons={...input}
  if(f.dodgeUntil>t&&f.poseUntil>t)f.pose='dash'
  f.guard=clamp(f.guard+dt*16,0,100)
  if(f.puppetUntil>t&&f.stunUntil<=t){f.vx=0}
  f.vy=clamp(f.vy+GRAVITY*dt,f.alterLysa&&f.euphoriaState==='active'?-1150:-900,1000);f.x=clamp(f.x+f.vx*dt,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE);f.y+=f.vy*dt
  if(f.y>=ARENA_FLOOR){
   f.y=ARENA_FLOOR;f.vy=0;f.onGround=true
   if(f.knockdownUntil>t&&f.getupAt===-1){f.getupAt=t+.28;f.knockdownUntil=f.getupAt+.35;f.stunUntil=Math.max(f.stunUntil,f.knockdownUntil);f.vx=0;effect(r,f.x,f.y-5,'dust',1)}
  }else f.onGround=false
 }
 updateZones(r,dt)
 r.projectiles=r.projectiles.filter(p=>{
  if(t<(p.launchAt||0))return true
  const owner=r.fighters.find(f=>f.id===p.ownerId);if(!owner)return false
  if(p.style==='alterClone'){
   const target=r.fighters.filter(f=>arenaOpponents(r,owner,f)&&alive(f)&&f.swallowedUntil<=t&&f.puddleUntil<=t).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)||a.id.localeCompare(b.id))[0]
   if(!target)return false
   p.targetId=target.id;p.vx=Math.sign(target.x-p.x)*180;p.y=ARENA_FLOOR
  }
  if(['shadow','tornado','iceDragon'].includes(p.style||'')){const e=r.fighters.find(f=>f.id===p.targetId&&alive(f));if(e){p.vx=Math.sign(e.x-p.x)*Math.abs(p.vx);p.y+=(e.y-(p.style==='iceDragon'?120:90)-p.y)*Math.min(1,dt*4)}}
  p.x+=p.vx*dt;if(t>=p.expiresAt||p.x<0||p.x>ARENA_WIDTH)return false
  // Colisão física com a primeira vítima no caminho, independente da ordem dos assentos.
  for(const e of [...r.fighters].sort((a,b)=>Math.abs(a.x-p.x)-Math.abs(b.x-p.x)||a.id.localeCompare(b.id)))if(arenaOpponents(r,owner,e)&&alive(e)&&e.swallowedUntil<=t&&e.puddleUntil<=t&&intersectsAABB(getProjectileHitbox(p),getFighterHurtbox(e))){
   if(receiveHit(r,owner,e,p.damage,true,p.x)){
    if(p.style==='chain'){e.vx=Math.sign(owner.x-e.x)*630;e.x=clamp(e.x+Math.sign(owner.x-e.x)*55,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE)}
    if(p.style==='ice')e.frozenUntil=t+.65;if(p.style==='root')e.rootUntil=t+.32
    if(p.style==='iceDragon')effect(r,e.x,e.y-100,'skill',1.4,owner.facing,'ice')
   }return false
  }return true
 })
 for(let i=0;i<r.fighters.length;i++)for(let j=i+1;j<r.fighters.length;j++){
  const a=r.fighters[i],b=r.fighters[j];if(!alive(a)||!alive(b)||a.swallowedUntil>t||b.swallowedUntil>t||a.puddleUntil>t||b.puddleUntil>t)continue
  // Somente os pés no mesmo plano bloqueiam passagem; o salto cruza por cima do corpo.
  if(Math.abs(a.y-b.y)>48)continue
  const ab=getFighterHurtbox(a),bb=getFighterHurtbox(b)
  if(intersectsAABB(ab,bb)){const overlap=Math.min(ab.x+ab.w-bb.x,bb.x+bb.w-ab.x),sign=a.x<b.x?-1:1;a.x=clamp(a.x+sign*overlap/2,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE);b.x=clamp(b.x-sign*overlap/2,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE)}
 }concludeRound(r)
}
export function advanceArena(r:ArenaSession,now=Date.now()){
 upgradeArenaSession(r)
 if(r.phase!=='playing'){r.tickAt=now;r.accumulator=0;return}
 const elapsed=clamp((now-r.tickAt)/1000,0,.25);r.tickAt=now;r.accumulator=clamp(r.accumulator+elapsed,0,.25)
 const steps=Math.min(15,Math.floor((r.accumulator+1e-9)/STEP));r.accumulator=Math.max(0,r.accumulator-steps*STEP)
 for(const f of r.fighters)if(!f.bot&&now-f.lastSeen>950)f.input={...NO_INPUT}
 for(let i=0;i<steps&&r.phase==='playing';i++)step(r,STEP)
}
/** Salas em memória sobrevivem ao hot reload; campos novos precisam ser inicializados. */
export function upgradeArenaSession(r:ArenaSession){
 if(r.schemaVersion===ARENA_SCHEMA_VERSION)return
 for(const [i,f]of r.fighters.entries()){
  const defaults=newFighter(f.id,f.userId,f.device,f.name,f.bot)
  for(const key of Object.keys(defaults) as (keyof ArenaFighter)[]){
   const value=f[key],fallback=defaults[key]
   if(value===undefined||typeof fallback==='number'&&!Number.isFinite(value as number))(f as unknown as Record<string,unknown>)[key]=fallback
  }
  if(!Array.isArray(f.attackTargets))f.attackTargets=[]
  if(!Array.isArray(f.directions))f.directions=[]
  f.input={...NO_INPUT,...f.input};f.previousButtons={...NO_INPUT,...f.previousButtons}
  f.x=clamp(f.x,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE)
  if(!Number.isInteger(f.slot))f.slot=i
  if(f.bot&&!f.botOwnerId&&f.autoBot===undefined)f.autoBot=true
 }
 r.zones||=[];r.projectiles||=[];r.effects||=[];r.secretUnlocks||=[];r.revision||=0;r.settings||={...DEFAULT_ARENA_SETTINGS};r.schemaVersion=ARENA_SCHEMA_VERSION
}
export function publicArena(r:ArenaSession):ArenaSnapshot {
 return {...r,fighters:r.fighters.map(({input,lastSeen,lastInputSeq,lastInputSource,lastPulseCounts,pendingPulses,previousJump,previousLight,previousHeavy,previousSpecial,previousDodge,previousButtons,directions,motionFacing,bufferKind,bufferUntil,bufferSpecial,attackTargets,...f})=>f)}
}
export function forfeitArena(r:ArenaSession,f:ArenaFighter){
 f.withdrawn=true;f.health=0;f.pose='ko';f.input={...NO_INPUT}
 if(r.phase==='paused'){r.phase='playing';r.pausedBy=null;r.tickAt=Date.now()}
 const rest=r.fighters.filter(alive),teams=arenaSettings(r).mode==='teams',remainingSides=teams?new Set(rest.map(f=>arenaTeam(r,f))).size:rest.length
 if(remainingSides<=1){r.phase='finished';r.winnerId=rest[0]?.id||null;r.winningTeam=teams&&rest[0]?arenaTeam(r,rest[0]) as 0|1:null;r.message=rest.length?character(r,rest[0])?.name+' VENCEU POR DESISTÊNCIA':'PARTIDA ENCERRADA'}
}
