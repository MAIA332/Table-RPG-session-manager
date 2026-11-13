import type {ArenaPublicFighter} from './model'
import {EUPHORIA_TRANSFORM_SECONDS,EUPHORIA_REVERT_SECONDS,ALTER_DANCE_SECONDS} from './model'
import type {ArenaAnimation,AnimationClock,AnimationFrame} from './animation'
const root='/arena/animations/alter-lysa/'
const atlas=(name:string)=>root+name+'-v'+(name==='dance'||name==='clone'?14:name.startsWith('base-')?11:['transform','euphoria-dash'].includes(name)?13:12)+'.webp'
export const ALTER_LYSA_ANIMATION_URLS=['base-movement','base-combat','euphoria-movement','euphoria-combat','euphoria-dash','transform','revert','dance','clone'].map(atlas)
const movement:Record<string,number>={idle:0,forward:1,backward:2,jump:3,crouch:4,guard:5,hit:6,fall:7,rise:7}
const combat:Record<string,number>={light:0,heavy:1,kick:2,lowKick:3,special0:1}
export function alterLysaFrame(f:ArenaPublicFighter,t:number,action:ArenaAnimation,prior?:AnimationClock):{clock:AnimationClock;sample:AnimationFrame}{
 const alive=f.health>0&&f.pose!=='ko',form=f.euphoriaState==='active'?'euphoria':'base'
 const key='alter:'+form+':'+action+(f.attackKind?':'+f.attackAt:'')
 const walking=action==='forward'||action==='backward'
 const release=action==='idle'&&(prior?.action==='crouch'||prior?.action==='guard'||prior?.action==='jump')?prior.action:undefined
 let clock=prior?.key===key?prior:{action,key,at:f.attackKind?f.attackAt:t,travel:walking?prior?.travel||0:0,lastX:f.x,release,releaseAt:release?t:undefined}
 const timed=(name:string,count:number,at:number,duration:number):{clock:AnimationClock;sample:AnimationFrame}=>{
  const frame=Math.max(0,Math.min(count-1,Math.floor((t-at)/duration*count)))
  return {clock,sample:{url:atlas(name),rows:count/6,row:Math.floor(frame/6),frame:frame%6,action:'special1'}}
 }
 if(alive&&action!=='fall'&&action!=='rise'&&f.euphoriaState==='transforming')return timed('transform',18,f.euphoriaAt,EUPHORIA_TRANSFORM_SECONDS)
 if(alive&&action!=='fall'&&action!=='rise'&&f.euphoriaState==='reverting')return timed('revert',12,f.euphoriaAt,EUPHORIA_REVERT_SECONDS)
 if(alive&&f.danceUntil>t)return timed('dance',24,f.danceAt,ALTER_DANCE_SECONDS)
 if(alive&&form==='euphoria'&&f.pose==='dash'&&f.dodgeUntil>t)return timed('euphoria-dash',12,f.dodgeUntil-.45,.45)
 const elapsed=Math.max(0,t-clock.at);let frame=0
 if(walking){clock.travel=(clock.travel||0)+Math.min(24,Math.abs(f.x-(clock.lastX??f.x)));clock.lastX=f.x;frame=Math.floor(clock.travel/22)%6}
 else if(action==='idle')frame=form==='euphoria'?(t-f.euphoriaAt<.5?Math.min(5,Math.floor(Math.max(0,t-f.euphoriaAt)*12)):3+Math.floor(elapsed*5)%3):Math.floor(elapsed*5)%6
 else if(action==='jump')frame=f.vy< -340?1:f.vy< -50?2:f.vy<180?3:f.y<430?4:5
 else if(action==='guard'||action==='crouch')frame=Math.min(3,Math.floor(elapsed*14))
 else if(action==='hit'||action==='fall')frame=Math.min(5,Math.floor(elapsed*(action==='hit'?22:11)))
 else if(action==='rise')frame=5-Math.max(0,Math.min(5,Math.floor((t-f.getupAt)/.35*6)))
 else {
  const startup=f.attackKind==='kick'?.18:f.attackKind==='heavy'?.14:f.attackKind==='lowKick'?.16:f.attackKind==='special'?.28:.12,dt=t-f.attackAt
  frame=dt<startup?Math.max(f.comboStep===3?2:f.comboStep>1?1:0,Math.min(2,Math.floor(Math.max(0,dt)/startup*3))):dt<startup+.14?3+Math.min(1,Math.floor((dt-startup)/.07)):5
 }
 let current=action
 if(clock.release&&t-(clock.releaseAt||0)<.16){current=clock.release;frame=clock.release==='jump'?5:4+Math.min(1,Math.floor((t-(clock.releaseAt||0))/.08))}
 const isCombat=current in combat
 return {clock,sample:{url:atlas(form+'-'+(isCombat?'combat':'movement')),rows:isCombat?4:8,row:(isCombat?combat:movement)[current]??0,frame,action:current}}
}
