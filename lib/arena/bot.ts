import type {ArenaFighter,ArenaInput,ArenaSession} from './model'
import {NO_INPUT} from './model'
import {DEFAULT_MOVES} from './character-schema'

/** Utility AI reproduzível, sem leituras antecipadas de comandos e sem serviços remotos. */
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v))
const noise=(n:number)=>{const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x)}
const hash=(s:string)=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0}
export function botInput(f:ArenaFighter,r:ArenaSession):ArenaInput{
 const enemy=r.fighters.filter(e=>e.id!==f.id&&!e.withdrawn&&e.health>0&&(r.settings?.mode!=='teams'||e.team!==f.team)).sort((a,b)=>Math.abs(a.x-f.x)-Math.abs(b.x-f.x))[0]
 if(!enemy)return {...NO_INPUT}
 const cfg=r.roster.find(x=>x.id===f.characterId)?.definition?.ai
 const style=cfg?.style||'balanced',difficulty=cfg?.difficulty||'normal'
 const reaction=difficulty==='easy'?.30:difficulty==='hard'?.12:.20
 const dx=enemy.x-f.x,range=Math.abs(dx),direction=dx<0?'left':'right',away=dx<0?'right':'left'
 const threat=enemy.attackKind&&enemy.attackUntil>r.gameTime&&range<200
 const vulnerable=enemy.attackKind&&enemy.attackUntil-r.gameTime<.14&&enemy.stunUntil<=r.gameTime
 const attackReady=f.stunUntil<=r.gameTime&&f.dizzyUntil<=r.gameTime&&f.attackCooldownUntil<=r.gameTime&&!f.attackKind
 const readyToThink=r.gameTime>=(f.botNextThink??0)
 if(!readyToThink){return {...NO_INPUT,...f.botMovement}}
 const tick=Math.floor(r.gameTime*60),variance=noise(hash(f.id)+tick),accuracy=difficulty==='hard'?.92:difficulty==='normal'?.7:.43
 const spacing=style==='zoner'?235:style==='grappler'?78:style==='rushdown'?105:145
 const options:[string,number][]=[
  ['approach',range>spacing?clamp((range-spacing)/200,0,1):0],
  ['retreat',range<spacing*.55?.42:0],
  ['defend',threat?.68+(difficulty==='hard'?.12:0):0],
  ['punish',vulnerable&&range<155?.92:0],
  ['poke',range<145&&!threat?.7:0],
  ['low',range<145&&!threat?.56:0],
  ['special',f.meter>=25&&(range>150||style==='zoner')?.48:0],
  ['jump',range>240&&style==='rushdown'?.2:0],
 ]
 const sorted=options.sort((a,b)=>b[1]-a[1])
 const choice=variance>accuracy&&sorted[1]?.[1]>0?sorted[1][0]:sorted[0][0]
 const movement:ArenaInput={...NO_INPUT}
 let attack:keyof ArenaInput|null=null
 if(choice==='approach')movement[direction]=true
 else if(choice==='retreat')movement[away]=true
 else if(choice==='defend'){movement.guard=true;movement.crouch=enemy.attackKind==='lowKick'||enemy.attackKind==='heavy'}
 else if(choice==='punish')attack=range<110?'heavy':'kick'
 else if(choice==='poke')attack=range<95?'light':'kick'
 else if(choice==='low')attack='lowKick'
 else if(choice==='special')attack='special'
 else if(choice==='jump')attack='jump'
 f.botNextThink=r.gameTime+reaction
 f.botMovement=movement
 if(attack&&attackReady){movement[attack]=true;f.botMovement={...NO_INPUT}}
 return movement
}
