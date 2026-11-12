/** Motor de luta 2D isolado. Física determinística a 60Hz no servidor.
 * Nenhum HP, recurso ou equipamento da ficha original é modificado. */
export const ARENA_WIDTH=960
export const ARENA_HEIGHT=540
export const ARENA_FLOOR=451
export const ARENA_MAX_FIGHTERS=4
export const ROUND_SECONDS=90
export const ROUNDS_TO_WIN=2
export const GRAVITY=1740
const STEP=1/60
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n))
export type MoveKind='light'|'heavy'|'special'
export type ArenaMove={kind:MoveKind;name:string;damage:number;range:number;magic:boolean;projectile:boolean}
export type ArenaPortrait={id:string;name:string;imageUrl:string;kind:'player'|'npc'|'monster';ownerId?:string;moves:ArenaMove[];speed:number;power:number;weaponStyle?:'blade'|'staff'|'bow'|'fists'}
export type ArenaInput={left:boolean;right:boolean;jump:boolean;light:boolean;heavy:boolean;special:boolean;guard:boolean;dodge:boolean;crouch:boolean}
export const NO_INPUT:ArenaInput={left:false,right:false,jump:false,light:false,heavy:false,special:false,guard:false,dodge:false,crouch:false}
export type FighterPose='idle'|'walk'|'jump'|'crouch'|'guard'|'dash'|'light'|'heavy'|'special'|'hit'|'ko'|'win'
export type ArenaBox={x:number;y:number;w:number;h:number}
export const intersectsAABB=(a:ArenaBox,b:ArenaBox)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y
export type ArenaFighter={
 id:string;userId:string;device:string;name:string;characterId:string|null;bot:boolean;withdrawn:boolean
 x:number;y:number;vx:number;vy:number;facing:number;onGround:boolean
 health:number;guard:number;meter:number;wins:number;combo:number;comboUntil:number
 pose:FighterPose;poseUntil:number;invincibleUntil:number;stunUntil:number;dodgeUntil:number
 attackKind:MoveKind|null;attackAt:number;attackUntil:number;attackHit:boolean;attackCooldownUntil:number
 /** Número do golpe leve na sequência (1, 2, 3). */
 comboStep:number;chainUntil:number;bufferKind:MoveKind|null;bufferUntil:number;airJumps:number
 lastHitBy:string|null;input:ArenaInput;lastSeen:number;lastInputSeq:number;lastInputSource:string;previousJump:boolean;previousLight:boolean;previousHeavy:boolean;previousSpecial:boolean;previousDodge:boolean
}
export type ArenaProjectile={id:number;ownerId:string;x:number;y:number;vx:number;damage:number;expiresAt:number;magic:boolean}
export type ArenaEffect={id:number;x:number;y:number;kind:'hit'|'guard'|'burst'|'ko'|'dust';expiresAt:number;power?:number;facing?:number}
export type ArenaSession={
 id:string;campaignId:string;phase:'lobby'|'playing'|'paused'|'finished';createdAt:number;gmId:string
 roster:ArenaPortrait[];fighters:ArenaFighter[];winnerId:string|null;pausedBy:string|null
 tickAt:number;accumulator:number;gameTime:number;roundElapsed:number;rounds:number;roundStatus:'intro'|'fight'|'ko'
 nextRoundAt:number;message:string;lastUpdateAt:number;projectiles:ArenaProjectile[];effects:ArenaEffect[];effectSequence:number;hitstopFrames?:number
}
export type ArenaPublicFighter=Omit<ArenaFighter,'input'|'lastSeen'|'lastInputSeq'|'lastInputSource'|'previousJump'|'previousLight'|'previousHeavy'|'previousSpecial'|'previousDodge'>
export type ArenaSnapshot=Omit<ArenaSession,'fighters'> & {fighters:ArenaPublicFighter[]}
const positions=[280,680,150,810]
export const spawnX=(i:number)=>positions[i]??480
const alive=(f:ArenaFighter)=>!f.withdrawn&&f.health>0
const moveOf=(room:ArenaSession,f:ArenaFighter,kind:MoveKind)=>room.roster.find(p=>p.id===f.characterId)?.moves.find(m=>m.kind===kind)
export function getFighterHurtbox(f:Pick<ArenaFighter,'x'|'y'|'pose'>):ArenaBox {
 if(f.pose==='ko')return {x:f.x-42,y:f.y-34,w:84,h:30}
 const duck=f.pose==='crouch'
 return {x:f.x-25,y:f.y-(duck?110:160),w:50,h:duck?105:153}
}
/** A caixa de ataque é independente da arte. Só fica ativa depois do startup. */
export function getAttackHitbox(f:Pick<ArenaFighter,'x'|'y'|'facing'|'attackKind'|'attackAt'|'attackUntil'|'comboStep'|'onGround'>,at:number,range?:number):ArenaBox|null {
 const kind=f.attackKind
 if(!kind||at>=f.attackUntil)return null
 const startup=kind==='special'?.22:kind==='heavy'?.17:.075
 const active=kind==='special'?.22:kind==='heavy'?.19:.15
 const elapsed=at-f.attackAt
 if(elapsed<startup||elapsed>startup+active)return null
 const step=kind==='light'?Math.max(1,f.comboStep):1
 const width=clamp(range??(kind==='special'?126:kind==='heavy'?100:step===3?105:81),58,185)
 const height=kind==='light'?(step===3?86:75):kind==='heavy'?105:126
 const low=kind==='light'&&step===2
 const base=f.y-(low?85:kind==='special'?163:kind==='heavy'?147:135)
 return {x:f.facing===1?f.x+10:f.x-10-width,y:base,w:width,h:height}
}
export function getProjectileHitbox(p:Pick<ArenaProjectile,'x'|'y'>):ArenaBox{return {x:p.x-19,y:p.y-14,w:38,h:28}}
function setupFighter(f:ArenaFighter,index:number){
 f.x=spawnX(index);f.y=ARENA_FLOOR;f.vx=0;f.vy=0;f.facing=index%2?-1:1;f.onGround=true
 f.health=100;f.guard=100;f.meter=0;f.combo=0;f.comboUntil=0;f.pose='idle';f.poseUntil=0
 f.invincibleUntil=0;f.stunUntil=0;f.dodgeUntil=0;f.attackKind=null;f.attackAt=0;f.attackUntil=0;f.attackHit=false;f.attackCooldownUntil=0
 f.comboStep=0;f.chainUntil=0;f.bufferKind=null;f.bufferUntil=0;f.airJumps=1
 f.lastHitBy=null;f.input={...NO_INPUT};f.lastInputSeq=0;f.lastInputSource='';f.previousJump=false;f.previousLight=false;f.previousHeavy=false;f.previousSpecial=false;f.previousDodge=false
}
export function newFighter(id:string,userId:string,device:string,name:string,bot=false):ArenaFighter{
 return {id,userId,device,name,characterId:null,bot,withdrawn:false,x:480,y:ARENA_FLOOR,vx:0,vy:0,facing:1,onGround:true,
 health:100,guard:100,meter:0,wins:0,combo:0,comboUntil:0,pose:'idle',poseUntil:0,invincibleUntil:0,stunUntil:0,dodgeUntil:0,
 attackKind:null,attackAt:0,attackUntil:0,attackHit:false,attackCooldownUntil:0,
 comboStep:0,chainUntil:0,bufferKind:null,bufferUntil:0,airJumps:1,
 lastHitBy:null,input:{...NO_INPUT},lastSeen:Date.now(),lastInputSeq:0,lastInputSource:'',previousJump:false,previousLight:false,previousHeavy:false,previousSpecial:false,previousDodge:false}
}
function initRound(room:ArenaSession){
 room.roundElapsed=0;room.rounds++;room.roundStatus='intro';room.nextRoundAt=room.gameTime+1.05
 room.projectiles=[];room.effects=[];room.hitstopFrames=0;room.message=`ROUND ${room.rounds}`
 room.fighters.forEach((f,i)=>{if(!f.withdrawn)setupFighter(f,i)})
}
export function startRound(room:ArenaSession){
 room.phase='playing';room.winnerId=null;room.pausedBy=null;room.hitstopFrames=0;room.rounds=0;room.gameTime=0;room.tickAt=Date.now();room.accumulator=0;room.effectSequence=0
 room.fighters.forEach(f=>{f.wins=0;f.withdrawn=false});initRound(room)
}
function effect(room:ArenaSession,x:number,y:number,kind:ArenaEffect['kind'],power=1,facing=1){
 room.effects.push({id:++room.effectSequence,x,y,kind,power,facing,expiresAt:room.gameTime+(kind==='ko'?.8:kind==='dust'?.23:.48)});
 if(room.effects.length>40)room.effects.shift()
}
function receiveHit(room:ArenaSession,attacker:ArenaFighter,target:ArenaFighter,damage:number,magic:boolean,impactX:number){
 const t=room.gameTime
 if(!alive(target)||target.id===attacker.id||target.invincibleUntil>t)return false
 // Defender voltado para o agressor pode bloquear; costas expostas não bloqueiam.
 const guarding=target.input.guard&&target.onGround&&target.stunUntil<=t&&target.facing*(attacker.x-target.x)>0
 const amount=guarding?Math.max(1,Math.round(damage*.15)):damage
 target.health=clamp(target.health-amount,0,100);target.lastHitBy=attacker.id
 attacker.combo=attacker.comboUntil>=t?attacker.combo+1:1;attacker.comboUntil=t+1.1
 attacker.meter=clamp(attacker.meter+(guarding?4:11),0,100);target.meter=clamp(target.meter+(guarding?5:8),0,100)
 if(guarding){
  target.guard=clamp(target.guard-(magic?24:17),0,100)
  target.pose=target.guard===0?'hit':'guard';target.stunUntil=t+(target.guard===0?.8:.14);target.poseUntil=target.stunUntil
  if(target.guard===0)room.message=`GUARDA QUEBRADA · ${target.name}`
  effect(room,impactX,target.y-72,'guard',1.1,attacker.facing)
 }else{
  target.attackKind=null;target.bufferKind=null;target.attackUntil=0;target.chainUntil=0
  target.vx=(target.x>=attacker.x?1:-1)*(110+damage*7)
  target.vy=damage>=11?-Math.min(365,100+damage*11):-90
  target.onGround=false;target.stunUntil=t+clamp(.2+damage*.014,.25,.72)
  target.pose='hit';target.poseUntil=target.stunUntil
  effect(room,impactX,target.y-74,'hit',clamp(damage/9,.8,2.5),attacker.facing)
  // Hitstop: 3–7 quadros congelam o impacto, não o comando nem a interface.
  room.hitstopFrames=Math.max(room.hitstopFrames||0,clamp(Math.round(damage*.32),3,7))
  room.message=attacker.combo>=2?`${attacker.name} · ${attacker.combo} HIT COMBO!`:`${attacker.name} acertou ${target.name}`
 }
 if(target.health<=0){target.pose='ko';target.poseUntil=t+4;effect(room,target.x,target.y-67,'ko',2.4,attacker.facing)}
 return true
}
function botInput(bot:ArenaFighter,room:ArenaSession):ArenaInput{
 const opponent=room.fighters.filter(f=>f.id!==bot.id&&alive(f)).sort((a,b)=>Math.abs(a.x-bot.x)-Math.abs(b.x-bot.x))[0]
 if(!opponent)return {...NO_INPUT}
 const t=room.gameTime,dx=opponent.x-bot.x,dist=Math.abs(dx)
 const beat=Math.floor(t*3.8+bot.x*.002),near=dist<105
 const attacking=opponent.attackKind!==null&&opponent.attackUntil>t
 return {left:dx< -76,right:dx>76,
  jump:bot.onGround&&dist>140&&dist<240&&beat%8===2,
  light:near&&beat%3===0,heavy:near&&beat%9===4,
  special:bot.meter>=35&&dist<280&&beat%11===7,
  guard:attacking&&dist<125&&beat%3===1,
  dodge:near&&attacking&&beat%13===3,crouch:false}
}
function startAttack(room:ArenaSession,f:ArenaFighter,kind:MoveKind){
 const t=room.gameTime
 if(kind==='special'&&f.meter<35)return false
 if(kind==='special')f.meter-=35
 if(kind==='light')f.comboStep=f.chainUntil>=t?f.comboStep%3+1:1
 else f.comboStep=0
 f.attackKind=kind;f.attackAt=t;f.attackHit=false
 const duration=kind==='special'?.57:kind==='heavy'?.43:f.comboStep===3?.40:.28
 f.attackUntil=t+duration
 f.chainUntil=kind==='light'?f.attackUntil+.26:0
 f.attackCooldownUntil=f.attackUntil+(kind==='special'?.22:kind==='heavy'?.13:.055)
 f.pose=kind;f.poseUntil=f.attackUntil;f.vx*=kind==='special'?.3:.45
 f.bufferKind=null;f.bufferUntil=0
 if(kind==='heavy')effect(room,f.x+f.facing*30,f.y-85,'dust',.5,f.facing)
 if(kind==='special')room.message=`${f.name} · ${moveOf(room,f,'special')?.name||'GOLPE ESPECIAL'}!`
 return true
}
function strike(room:ArenaSession,f:ArenaFighter){
 if(!f.attackKind||f.attackHit)return
 const kind=f.attackKind,move=moveOf(room,f,kind)
 const damage=clamp(move?.damage??(kind==='special'?20:kind==='heavy'?14:7),4,26)
 const scaled=kind==='light'?(f.comboStep===3?damage+3:damage):damage
 if(kind==='special'&&move?.projectile){
  room.projectiles.push({id:++room.effectSequence,ownerId:f.id,x:f.x+f.facing*43,y:f.y-76,vx:f.facing*460,damage:scaled,magic:true,expiresAt:room.gameTime+1.5})
  effect(room,f.x+f.facing*50,f.y-76,'burst',2.1,f.facing)
 }else{
  const box=getAttackHitbox(f,room.gameTime,move?.range)
  if(!box)return
  for(const enemy of room.fighters){
   if(!alive(enemy)||enemy.id===f.id)continue
   if(intersectsAABB(box,getFighterHurtbox(enemy)))receiveHit(room,f,enemy,scaled,!!move?.magic,box.x+box.w/2)
  }
  if(kind==='special')effect(room,box.x+box.w/2,box.y+box.h/2,'burst',2.1,f.facing)
 }
 f.attackHit=true
}
function concludeRound(room:ArenaSession){
 if(room.roundStatus!=='fight')return
 const present=room.fighters.filter(f=>!f.withdrawn);if(present.length<2)return
 const living=present.filter(alive);if(living.length>1&&room.roundElapsed<ROUND_SECONDS)return
 const ranked=[...present].sort((a,b)=>b.health-a.health)
 const winner=living.length===1?living[0]:ranked[0]?.health!==ranked[1]?.health?ranked[0]:null
 if(winner)winner.wins++
 room.roundStatus='ko';room.nextRoundAt=room.gameTime+2.35
 room.message=winner?`${winner.name} · ROUND ${winner.wins}`:'EMPATE!'
 if(winner&&winner.wins>=ROUNDS_TO_WIN){room.phase='finished';room.winnerId=winner.id;room.message=`${winner.name} VENCEU O COMBATE!`;winner.pose='win'}
}
function step(room:ArenaSession,dt:number){
 if((room.hitstopFrames||0)>0){room.hitstopFrames=(room.hitstopFrames||0)-1;return}
 room.gameTime+=dt
 const t=room.gameTime
 if(room.roundStatus==='intro'){if(t>=room.nextRoundAt){room.roundStatus='fight';room.message='FIGHT!'}return}
 if(room.roundStatus==='ko'){if(t>=room.nextRoundAt)initRound(room);return}
 room.roundElapsed+=dt;room.effects=room.effects.filter(e=>e.expiresAt>t)
 for(const f of room.fighters){
  if(!alive(f))continue
  const input=f.bot?botInput(f,room):f.input
  const moving=Number(input.right)-Number(input.left)
  const dizzy=f.stunUntil>t
  const attackActive=!!f.attackKind&&t<f.attackUntil
  const speed=clamp(room.roster.find(p=>p.id===f.characterId)?.speed||210,135,310)
  // Fila de input: golpes rápidos pressionados durante a animação não se perdem.
  const request:MoveKind|null=input.special&&!f.previousSpecial?'special':input.heavy&&!f.previousHeavy?'heavy':input.light&&!f.previousLight?'light':null
  f.previousLight=input.light;f.previousHeavy=input.heavy;f.previousSpecial=input.special
  if(request){f.bufferKind=request;f.bufferUntil=t+.23}
  if(f.bufferUntil<t)f.bufferKind=null
  // Cancel de golpe leve em outro leve, de leve em forte ou em especial.
  const canCancel=attackActive&&f.attackKind==='light'&&f.attackHit&&t>=f.attackAt+.12&&
   (f.bufferKind==='light'||f.bufferKind==='heavy'||f.bufferKind==='special')
  if(!dizzy&&!input.guard&&f.bufferKind&&f.bufferUntil>=t&&t>=f.dodgeUntil&&(
   canCancel||(!attackActive&&t>=f.attackCooldownUntil)))startAttack(room,f,f.bufferKind)
  const attacking=!!f.attackKind&&t<f.attackUntil
  if(!dizzy&&!attacking&&t>=f.dodgeUntil){
   if(input.guard&&f.onGround){f.vx*=.55;f.pose='guard';f.guard=clamp(f.guard-dt*1.6,0,100)}
   else if(input.crouch&&f.onGround){f.vx*=.62;f.pose='crouch'}
   else if(moving){f.vx=moving*speed;f.facing=moving;f.pose=f.onGround?'walk':'jump'}
   else{f.vx*=Math.pow(.81,dt*60);f.pose=f.onGround?'idle':'jump'}
   if(input.jump&&!f.previousJump&&!input.guard){
    if(f.onGround){f.vy=-645;f.onGround=false;f.pose='jump';effect(room,f.x,f.y-7,'dust',.8,f.facing)}
    else if(f.airJumps>0){f.vy=-545;f.airJumps--;f.pose='jump';effect(room,f.x,f.y-30,'burst',.9,f.facing)}
   }
   if(input.dodge&&!f.previousDodge&&!input.guard){f.dodgeUntil=t+.55;f.invincibleUntil=t+.21;f.vx=f.facing*470;f.pose='dash';f.poseUntil=t+.21;effect(room,f.x,f.y-20,'dust',.75,f.facing)}
  }
  f.previousJump=input.jump;f.previousDodge=input.dodge
  if(f.attackKind){
   if(t<f.attackUntil){
    const box=getAttackHitbox(f,t,moveOf(room,f,f.attackKind)?.range)
    if(box&&!f.attackHit)strike(room,f)
   }else{f.attackKind=null;if(f.stunUntil<=t)f.pose=f.onGround?'idle':'jump'}
  }
  if(dizzy){f.pose='hit';f.vx*=Math.pow(.94,dt*60)}
  if(t<f.dodgeUntil&&t<f.poseUntil)f.pose='dash'
  if(!input.guard&&f.guard<100)f.guard=clamp(f.guard+dt*21,0,100)
  f.vy=clamp(f.vy+GRAVITY*dt,-760,1040)
  f.x=clamp(f.x+f.vx*dt,26,ARENA_WIDTH-26)
  f.y+=f.vy*dt
  if(f.y>=ARENA_FLOOR){if(!f.onGround&&f.vy>320)effect(room,f.x,ARENA_FLOOR-5,'dust',.7,f.facing);f.y=ARENA_FLOOR;f.vy=0;f.onGround=true;f.airJumps=1}else f.onGround=false
 }
 room.projectiles=room.projectiles.filter(p=>{
  p.x+=p.vx*dt
  if(t>=p.expiresAt||p.x<0||p.x>ARENA_WIDTH)return false
  const owner=room.fighters.find(f=>f.id===p.ownerId);if(!owner)return false
  for(const f of room.fighters){
   if(f.id!==p.ownerId&&intersectsAABB(getProjectileHitbox(p),getFighterHurtbox(f))){
    receiveHit(room,owner,f,p.damage,p.magic,p.x);return false
   }
  }
  return true
 })
 // Separação AABB entre corpos; não atravessam oponentes quando estão no chão.
 for(let i=0;i<room.fighters.length;i++)for(let j=i+1;j<room.fighters.length;j++){
  const a=room.fighters[i],b=room.fighters[j]
  if(!alive(a)||!alive(b))continue
  const ab=getFighterHurtbox(a),bb=getFighterHurtbox(b)
  if(intersectsAABB(ab,bb)){
   const overlap=Math.min(ab.x+ab.w-bb.x,bb.x+bb.w-ab.x)
   const sign=a.x<b.x?-1:1
   a.x=clamp(a.x+sign*overlap/2,26,ARENA_WIDTH-26)
   b.x=clamp(b.x-sign*overlap/2,26,ARENA_WIDTH-26)
  }
 }
 concludeRound(room)
}
/** 60 Hz determinísticos; clamps impedem espirais de atraso após troca de aba. */
export function advanceArena(room:ArenaSession,now=Date.now()){
 if(room.phase!=='playing'){room.tickAt=now;room.accumulator=0;return}
 const elapsed=clamp((now-room.tickAt)/1000,0,.24);room.tickAt=now
 room.accumulator=clamp((room.accumulator||0)+elapsed,0,.24)
 const steps=Math.min(15,Math.floor((room.accumulator+1e-9)/STEP))
 room.accumulator=Math.max(0,room.accumulator-steps*STEP)
 for(const f of room.fighters)if(!f.bot&&now-f.lastSeen>950)f.input={...NO_INPUT}
 for(let i=0;i<steps&&room.phase==='playing';i++)step(room,STEP)
}
export function publicArena(room:ArenaSession):ArenaSnapshot{
 return {...room,fighters:room.fighters.map(({input,lastSeen,lastInputSeq,lastInputSource,previousJump,previousLight,previousHeavy,previousSpecial,previousDodge,...f})=>f)}
}
export function forfeitArena(room:ArenaSession,fighter:ArenaFighter){
 fighter.withdrawn=true;fighter.health=0;fighter.pose='ko';fighter.input={...NO_INPUT}
 if(room.phase==='paused'){room.phase='playing';room.pausedBy=null;room.tickAt=Date.now()}
 if(room.phase==='playing'){
  const remaining=room.fighters.filter(alive)
  if(remaining.length<=1){room.phase='finished';room.winnerId=remaining[0]?.id||null;room.message=remaining.length?`${remaining[0].name} VENCEU POR DESISTÊNCIA`:'PARTIDA ENCERRADA'}
 }
}
