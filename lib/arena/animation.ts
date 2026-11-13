import type {ArenaPublicFighter,ArenaPortrait} from './model'
import {attackTiming} from './model'
import {alterLysaFrame,ALTER_LYSA_ANIMATION_URLS} from './alter-animation'
export const ANIMATION_COLUMNS=6
export type ArenaAnimation='idle'|'forward'|'backward'|'jump'|'crouch'|'guard'|'hit'|'fall'|'rise'|'light'|'heavy'|'kick'|'lowKick'|'special0'|'special1'|'special2'
export type AnimationClock={action:ArenaAnimation;key:string;at:number;travel?:number;lastX?:number;release?:'crouch'|'guard'|'jump';releaseAt?:number}
export type AnimationFrame={url:string;row:number;rows:number;frame:number;action:ArenaAnimation}
export function attackAnimationFrame(kind:Parameters<typeof attackTiming>[0],elapsed:number,step=1){
 const startup=attackTiming(kind).startup
 return elapsed<startup?Math.max(step===3?2:step>1?1:0,Math.min(2,Math.floor(Math.max(0,elapsed)/startup*3))):elapsed<startup+.14?3+Math.min(1,Math.floor((elapsed-startup)/.07)):5
}
const movementRows:Record<string,number>={idle:0,forward:1,backward:2,jump:3,crouch:4,guard:5,hit:6,fall:7,rise:7}
const combatRows:Record<string,number>={light:0,heavy:1,kick:2,lowKick:3,special0:4,special1:5,special2:6}
const canonicalWalks=new Set(['fander','andreas','valya','thorfinn','langris'])
const lighteaRows:Record<string,number>={idle:0,jump:1,crouch:2,guard:3,hit:4,fall:5,rise:5}
export const walkAtlas=(id:string)=>'/arena/animations/'+id+'/'+(canonicalWalks.has(id)?'movement.webp':'walk-v4.webp')
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v))
export function fighterAnimation(f:ArenaPublicFighter,t:number):ArenaAnimation{
 if(f.health<=0||f.pose==='ko')return 'fall'
 if(f.knockdownUntil>t)return f.getupAt>0&&t>=f.getupAt&&f.onGround?'rise':'fall'
 if(f.attackKind&&f.attackUntil>t)return f.attackKind==='special'?('special'+f.specialIndex) as ArenaAnimation:f.attackKind
 if(f.puppetUntil>t||f.characterId==='lightea'&&f.pose==='dash')return 'special0'
 if(f.pose==='hit')return 'hit'
 if(f.pose==='guard')return 'guard'
 if(f.pose==='crouch')return 'crouch'
 if(!f.onGround||f.pose==='jump')return 'jump'
 if(f.pose==='dash')return f.vx*f.facing<0?'backward':'forward'
 if(f.pose==='walk'||Math.abs(f.vx)>35)return f.vx*f.facing<0?'backward':'forward'
 return 'idle'
}
export function animationFrame(p:ArenaPortrait,f:ArenaPublicFighter,t:number,clock?:AnimationClock):{clock:AnimationClock;sample:AnimationFrame}{
 if(f.alterLysa)return alterLysaFrame(f,t,fighterAnimation(f,t),clock)
 const action=fighterAnimation(f,t),key=action+(f.attackKind&&f.attackUntil>t?':'+f.attackAt:'')
 let state=clock
 if(!state||state.key!==key){
  const release=action==='idle'&&(state?.action==='crouch'||state?.action==='guard'||state?.action==='jump')?state.action:undefined
  const walking=action==='forward'||action==='backward',wasWalking=state?.action==='forward'||state?.action==='backward'
  state={action,key,at:f.attackKind?f.attackAt:t,travel:walking&&wasWalking?state?.travel:0,lastX:f.x,release,releaseAt:release?t:undefined}
 }
 let frame=0,current=action,elapsed=Math.max(0,t-state.at)
 if(state.release&&t-(state.releaseAt||0)<.16){current=state.release;frame=state.release==='jump'?5:4+Math.min(1,Math.floor((t-(state.releaseAt||0))/.08))}
 else if(action==='idle')frame=Math.floor(elapsed*5)%6
 else if(action==='forward'||action==='backward'){
  // Doze desenhos de um ciclo completo; as duas pernas alternam sem inverter a sequência.
  state.travel=(state.travel||0)+Math.min(24,Math.abs(f.x-(state.lastX??f.x)));state.lastX=f.x
  // As caminhadas canônicas compartilham modelo e escala com os golpes.
  if(canonicalWalks.has(p.id))return {clock:state,sample:{url:walkAtlas(p.id),row:action==='forward'?1:2,rows:8,frame:Math.floor(state.travel/22)%6,action}}
  const cycle=Math.floor(state.travel/11)%12
  return {clock:state,sample:{url:walkAtlas(p.id),row:(action==='forward'?0:2)+Math.floor(cycle/6),rows:4,frame:cycle%6,action}}
 }
 else if(action==='jump')frame=elapsed<.045?0:f.vy< -340?1:f.vy< -50?2:f.vy<180?3:f.y<430?4:5
 else if(action==='crouch'||action==='guard')frame=Math.min(3,Math.floor(elapsed*14))
 else if(action==='hit')frame=clamp(Math.floor(elapsed*22),0,5)
 else if(action==='fall')frame=clamp(Math.floor(elapsed*11),0,5)
 else if(action==='rise')frame=5-clamp(Math.floor((t-f.getupAt)/.35*6),0,5)
 else if(!f.attackKind)frame=f.puppetUntil>t?2+Math.floor(elapsed*9)%3:clamp(Math.floor(elapsed*20),0,5)
 else {
  frame=attackAnimationFrame(f.attackKind,Math.max(0,t-f.attackAt),f.comboStep)
 }
 const combat=current in combatRows
 if((p.id==='joffrey'||p.id==='amelia')&&current==='idle')return {clock:state,sample:{url:'/arena/animations/'+p.id+'/idle-v9.webp',row:0,rows:1,frame,action:current}}
 if(p.id==='lightea')return {clock:state,sample:{url:'/arena/animations/lightea/'+(combat?'combat':'movement')+'-v9.webp',row:combat?Math.min(5,combatRows[current]):lighteaRows[current]??0,rows:6,frame,action:current}}
 if(p.id==='fander'&&current==='special2')return {clock:state,sample:{url:'/arena/animations/fander/elbow-v4.webp',row:f.buffUntil>t?1:0,rows:2,frame,action:current}}
 if(p.id==='valya'&&current==='special2')return {clock:state,sample:{url:'/arena/animations/valya/dragon-v5.webp',row:0,rows:1,frame,action:current}}
 if(p.id==='loulan'&&current==='special2')return {clock:state,sample:{url:'/arena/animations/loulan/switch-v4.webp',row:f.weapon==='karambit'?0:1,rows:2,frame,action:current}}
 return {clock:state,sample:{url:'/arena/animations/'+p.id+'/'+(combat?(p.id==='thorfinn'?'combat-v16':'combat'):p.id==='miguel'?'movement-v4':'movement')+'.webp',row:combat?combatRows[current]:movementRows[current],rows:combat?7:8,frame,action:current}}
}
export const animationUrls=(id:string)=>id==='alter-lysa'?ALTER_LYSA_ANIMATION_URLS:[...(id==='lightea'?['/arena/animations/lightea/movement-v9.webp','/arena/animations/lightea/combat-v9.webp']:['/arena/animations/'+id+'/'+(id==='miguel'?'movement-v4':'movement')+'.webp','/arena/animations/'+id+'/'+(id==='thorfinn'?'combat-v16':'combat')+'.webp']),walkAtlas(id),...((id==='joffrey'||id==='amelia')?['/arena/animations/'+id+'/idle-v9.webp']:[]),...(id==='fander'?['/arena/animations/fander/elbow-v4.webp']:id==='loulan'?['/arena/animations/loulan/switch-v4.webp']:id==='valya'?['/arena/animations/valya/dragon-v5.webp']:[])]
