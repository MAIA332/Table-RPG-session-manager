import {ARENA_EDGE,ARENA_WIDTH,ARENA_FLOOR,GRAVITY,type ArenaSnapshot,type ArenaPublicFighter} from './model'
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v))
const mix=(a:number,b:number,k:number)=>a+(b-a)*k
/** A continuous simulation-time playhead absorbs arrival jitter. Pose, projectiles and
 * positions use the same delayed snapshot rather than mixing old positions/new attacks. */
export class ArenaTimeline{
 private history:{room:ArenaSnapshot;at:number}[]=[]
 private latest:ArenaSnapshot|null=null
 private previousAt=0
 private playhead=0
 private jitter=0
 sample(latest:ArenaSnapshot,now:number){
  const previous=this.latest,reset=!previous||previous.id!==latest.id||previous.rounds!==latest.rounds||previous.phase!==latest.phase||previous.roundStatus!==latest.roundStatus||latest.gameTime<previous.gameTime-.1
  if(reset){this.history=[];this.playhead=latest.gameTime;this.previousAt=now;this.jitter=0}
  if(latest!==previous){
   const last=this.history.at(-1)
   if(last&&latest.gameTime>last.room.gameTime){const deviation=Math.abs((now-last.at)/1000-(latest.gameTime-last.room.gameTime));this.jitter=mix(this.jitter,Math.min(.15,deviation),.12)}
   if(last&&last.room.gameTime===latest.gameTime)last.room=latest
   else this.history.push({room:latest,at:now})
   if(this.history.length>64)this.history.shift()
   this.latest=latest
  }
  const last=this.history.at(-1)!,age=Math.max(0,(now-last.at)/1000),delay=clamp(.10+this.jitter*2.5,.10,.22),dt=clamp((now-this.previousAt)/1000,0,.05);this.previousAt=now
  if(latest.phase!=='playing'||latest.roundStatus!=='fight')return{room:latest,time:latest.gameTime+(latest.phase==='playing'?Math.min(age,.08):0),delay:0}
  const cap=latest.gameTime+((latest.hitstopFrames||0)>0?0:.08),target=Math.min(cap,latest.gameTime+Math.min(age,.08)-delay),error=target-this.playhead
  if(Math.abs(error)>.5)this.playhead=target
  else this.playhead+=dt*clamp(1+error*5,.8,1.25)
  this.playhead=clamp(this.playhead,this.history[0].room.gameTime,cap)
  let a=this.history[0].room,b=latest
  for(let i=1;i<this.history.length;i++){if(this.history[i].room.gameTime>this.playhead){a=this.history[i-1].room;b=this.history[i].room;break}a=this.history[i].room}
  const k=clamp((this.playhead-a.gameTime)/Math.max(.0001,b.gameTime-a.gameTime),0,1),lead=clamp(this.playhead-latest.gameTime,0,.08)
  const fighters=a.fighters.map(f=>{
   const next=b.fighters.find(e=>e.id===f.id)||f
   if(lead>0){const x=clamp(f.x+f.vx*lead,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE),y=f.onGround?f.y:Math.min(ARENA_FLOOR,f.y+f.vy*lead+.5*GRAVITY*lead*lead);return{...f,x,y}}
   if(Math.abs(next.x-f.x)>220)return f
   return{...f,x:mix(f.x,next.x,k),y:mix(f.y,next.y,k),puppetX:mix(f.puppetX,next.puppetX,k)} as ArenaPublicFighter
  })
  const projectiles=a.projectiles.map(p=>{const next=b.projectiles.find(e=>e.id===p.id)||p;return{...p,x:lead>0?p.x+p.vx*lead:mix(p.x,next.x,k),y:mix(p.y,next.y,k)}})
  return{room:{...latest,fighters,projectiles,zones:a.zones,effects:a.effects,gameTime:this.playhead},time:this.playhead,delay}
 }
}
