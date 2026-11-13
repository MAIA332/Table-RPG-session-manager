'use client'
import {useEffect,useRef} from 'react'
import {ARENA_FLOOR,ARENA_HEIGHT,ARENA_WIDTH,ARENA_EDGE,ARENA_GO_CLEAR_SECONDS,GRAVITY,getFighterHurtbox,getAttackHitbox,arenaOpponents,type ArenaSnapshot,type ArenaInput} from '@/lib/arena/model'
import {ARENA_STAGES,fighterPortrait} from '@/lib/arena/catalog'
import {animationFrame,attackAnimationFrame,type AnimationClock,type AnimationFrame} from '@/lib/arena/animation'
import {FX_ROWS,FX_URLS,fxFrame,fxUrl,fxRows,CHARACTER_SPECIAL_FX,CHARACTER_BASIC_FX,type ArenaFx} from '@/lib/arena/fx'
import {arenaAudio,attackAudioCue} from '@/lib/arena/audio'
import {fighterDimensions,SPRITE_CELL,SPRITE_ANCHOR_X,SPRITE_ANCHOR_Y} from '@/lib/arena/geometry'
import {arenaCamera,ARENA_CAMERA_MARGIN} from '@/lib/arena/camera'
import headData from '@/lib/arena/fander-heads.json'
import {arenaImage,arenaImageCount} from '@/lib/arena/assets'
import effectAnchors from '@/lib/arena/effect-anchors.json'

type Props={room:ArenaSnapshot;getSnapshot?:()=>ArenaSnapshot;debugBoxes?:boolean;localPlayerId:string;getLocalInput:(device:string)=>ArenaInput|undefined;onPointerAttack:(kind:'light'|'heavy',pressed:boolean)=>void}
type Seen={room:ArenaSnapshot;at:number}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n))
const mix=(a:number,b:number,t:number)=>a+(b-a)*t
const asset=arenaImage
function drawFrame(g:CanvasRenderingContext2D,sample:AnimationFrame,x:number,y:number,facing:number,characterId:string,horns=false,t=0){
 const image=asset(sample.url);if(!image.complete||!image.naturalWidth||![sample.frame,sample.row,x,y].every(Number.isFinite))return false
 const width=image.naturalWidth/6,height=image.naturalHeight/sample.rows
 g.save();g.translate(x,y);g.scale(facing,1)
 const scale=fighterDimensions(characterId).scale
 g.drawImage(image,sample.frame*width,sample.row*height,width,height,-SPRITE_ANCHOR_X*scale,-SPRITE_ANCHOR_Y*scale,SPRITE_CELL*scale,SPRITE_CELL*scale)
 if(horns&&characterId==='fander'&&!sample.url.includes('elbow-v4')){
  const heads=headData as Record<string,{x:number;y:number}[]>,head=heads[sample.url]?.[sample.row*6+sample.frame]
  if(head)fx(g,'horns',(head.x-SPRITE_ANCHOR_X)*scale,(head.y-SPRITE_ANCHOR_Y-13)*scale,43*scale,43*scale,t,true,1)
 }
 g.restore()
 return true
}
function fx(g:CanvasRenderingContext2D,key:ArenaFx,x:number,y:number,w:number,h:number,elapsed:number,persistent=false,facing=1,alpha=1,authoredFrame?:number,grounded=false){
 const [atlas,row]=FX_ROWS[key],image=asset(fxUrl(atlas))
 if(!image.complete||!image.naturalWidth)return
 const cw=image.naturalWidth/6,ch=image.naturalHeight/fxRows(atlas),frame=authoredFrame??fxFrame(elapsed,persistent)
 if(grounded)y-=((effectAnchors as Record<string,number[]>)[key]?.[frame]??.5)*h
 g.save();g.globalAlpha*=alpha;g.translate(x,y);g.scale(facing,1)
 g.drawImage(image,frame*cw,row*ch,cw,ch,-w/2,-h/2,w,h)
 g.restore()
}
const effectKey=(style:string|undefined):ArenaFx|undefined=>{
 if(!style)return
 if(style in FX_ROWS)return style as ArenaFx
 if(style==='hands')return 'roots'
 if(style.startsWith('weapon:'))return 'blade'
 if(style==='emerge'||style==='spit')return 'puddle'
 const [id,index]=style.split(':');return CHARACTER_SPECIAL_FX[id]?.[Number(index)]
}
const castDimensions:Partial<Record<ArenaFx,[number,number,number,number]>>={
 electricKick:[300,170,95,35],electricAura:[280,300,0,-15],shadowAura:[275,285,0,-15],darkness:[480,250,0,50],whip:[350,170,135,0],
 electricElbow:[220,165,85,-15],fateHands:[230,200,90,0],
 dodge:[280,245,-15,-10],fireAura:[260,280,0,-15],blizzard:[360,300,100,-10],cage:[180,270,0,-5],barrier:[320,270,0,-5],
 claw:[290,220,105,0],bloodAura:[270,300,0,-20],revive:[300,320,0,-20],gravityPull:[420,260,80,20],repulse:[420,280,80,-5],devour:[330,260,100,0],blade:[200,170,55,0],
}
export function ArenaStage(props:Props){
 const canvasRef=useRef<HTMLCanvasElement>(null),live=useRef(props);live.current=props
 useEffect(()=>{
  const canvas=canvasRef.current,g=canvas?.getContext('2d',{alpha:false});if(!canvas||!g)return
  let frame=0,previousAt=performance.now(),lastState:ArenaSnapshot|null=null,lastArrival=previousAt,lastFpsAt=previousAt,frames=0,round=0,logicalWidth=960
  let view:{x:number;zoom:number}|null=null
  const history:Seen[]=[],positions=new Map<string,{x:number;y:number}>(),clocks=new Map<string,AnimationClock>(),heard=new Set<string>(),steps=new Map<string,number>(),puddle=new Map<string,{active:boolean;emergeAt:number}>()
  const previousFrames=new Map<string,AnimationFrame>()
  for(const url of FX_URLS)asset(url)
  const fit=()=>{
   const bounds=canvas.parentElement?.getBoundingClientRect();if(!bounds)return
   const width=Math.max(160,Math.min(1920,Math.round(bounds.width/Math.max(1,bounds.height)*540)))
   if(width!==logicalWidth){logicalWidth=width;canvas.width=width}
  }
  const observer=new ResizeObserver(fit);if(canvas.parentElement)observer.observe(canvas.parentElement);fit()
  const unlock=()=>{void arenaAudio.unlock()}
  window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock)
  const once=(key:string,cue:string,x=480)=>{if(!heard.has(key)){heard.add(key);void arenaAudio.play(cue,x)}}
  const render=(now:number)=>{
   frame=requestAnimationFrame(render)
   if(document.visibilityState==='hidden'){previousAt=now;return}
   const dt=clamp((now-previousAt)/1000,0,.04);previousAt=now;frames++
   if(now-lastFpsAt>=1000){canvas.dataset.fps=String(Math.round(frames*1000/(now-lastFpsAt)));frames=0;lastFpsAt=now}
   const current=live.current,room=current.getSnapshot?.()||current.room
   if(room!==lastState){
    if(room.rounds!==round||lastState&&room.gameTime<lastState.gameTime-.1){history.length=0;positions.clear();clocks.clear();heard.clear();puddle.clear();round=room.rounds}
    history.push({room,at:now});if(history.length>8)history.shift();lastArrival=now;lastState=room
   }
   const lag=room.phase==='playing'?clamp((now-lastArrival)/1000,0,.09):0,t=room.gameTime+lag,stage=ARENA_STAGES.find(s=>s.id===room.stageId)||ARENA_STAGES[0],background=asset(stage.image)
   g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.imageSmoothingEnabled=true;g.fillStyle='#0d1017';g.fillRect(0,0,logicalWidth,540)
   const wanted=arenaCamera(room.fighters,logicalWidth)
   if(!view)view={x:wanted.x,zoom:wanted.zoom}
   view.zoom=wanted.zoom<view.zoom?wanted.zoom:mix(view.zoom,wanted.zoom,1-Math.exp(-dt*7))
   view.x=clamp(mix(view.x,wanted.x,1-Math.exp(-dt*12)),-ARENA_CAMERA_MARGIN,Math.max(-ARENA_CAMERA_MARGIN,ARENA_WIDTH+ARENA_CAMERA_MARGIN-logicalWidth/view.zoom))
   const camera={...view,y:ARENA_FLOOR*(1-view.zoom)}
   canvas.dataset.camera=JSON.stringify({x:camera.x,zoom:camera.zoom,worldWidth:ARENA_WIDTH,viewportWidth:logicalWidth})
   if(background.complete&&background.naturalWidth){
    const worldWidth=(ARENA_WIDTH+ARENA_CAMERA_MARGIN*2)*camera.zoom,ratio=background.naturalHeight/background.naturalWidth
    const h=Math.max(worldWidth*ratio,ARENA_FLOOR/.83,(ARENA_HEIGHT-ARENA_FLOOR)/.17),w=h/ratio
    g.drawImage(background,(-ARENA_CAMERA_MARGIN-camera.x)*camera.zoom-(w-worldWidth)/2,ARENA_FLOOR-h*.83,w,h)
   }
   g.save();g.translate(-camera.x*camera.zoom,camera.y);g.scale(camera.zoom,camera.zoom)
   // Os efeitos de golpe, campos e projéteis são quadros de atlas desenhados.
   for(const zone of room.zones||[]){
    const key:ArenaFx=zone.kind==='gravity'?'gravityPull':zone.kind==='fate'?'fateHands':zone.kind==='roots'?'parasitic':zone.kind
    const size=zone.kind==='cage'?[180,270]:zone.kind==='roots'?[240,185]:zone.kind==='fate'?[260,225]:zone.kind==='barrier'?[420,400]:[zone.radius*2.2,280]
    fx(g,key,zone.x,ARENA_FLOOR,size[0],size[1],t,true,1,.95,undefined,true)
   }
   for(const f of room.fighters){
    if(f.withdrawn||f.swallowedUntil>t)continue
    const p=fighterPortrait(room.roster,f);if(!p)continue
    const owned=f.userId===current.localPlayerId&&!f.bot&&room.phase==='playing',input=owned&&room.roundStatus==='fight'?current.getLocalInput(f.device):undefined,intent=input?Number(input.right)-Number(input.left):0
    let x=f.x+f.vx*lag,y=Math.min(ARENA_FLOOR,f.y+f.vy*lag+(f.onGround?0:.5*GRAVITY*lag*lag))
    const state=positions.get(f.id)
    if(owned&&state&&room.roundStatus==='fight'&&f.stunUntil<=t&&f.frozenUntil<=t&&f.rootUntil<=t&&!f.attackKind&&f.puppetUntil<=t&&f.dodgeUntil<=t&&!(f.alterLysa&&(f.euphoriaState==='transforming'||f.euphoriaState==='reverting'||f.danceUntil>t))){
     const speed=f.puddleUntil>t?430:(p.speed||225)*(f.buffUntil>t?1.35:1)*(f.characterId==='loulan'&&f.weapon==='kunai'?1.1:1)*(f.alterLysa&&f.euphoriaState==='active'?1.2:1)*(intent===-f.facing?.65:1)*(f.onGround&&(input?.crouch||input?.guard)?0:1)
     x=state.x+intent*speed*dt;x+=clamp(f.x+intent*speed*.025-x,-45,45)*Math.min(1,dt*10);x=clamp(x,ARENA_EDGE,ARENA_WIDTH-ARENA_EDGE)
    }else if(state&&Math.abs(state.x-x)<120){x=mix(state.x,x,1-Math.exp(-dt*26));y=mix(state.y,y,1-Math.exp(-dt*28))}
    if(!owned&&history.length>=2){
     const displayAt=now-55;let a=history[0],b=history.at(-1)!
     for(let i=1;i<history.length;i++)if(history[i].at>=displayAt){a=history[i-1];b=history[i];break}
     const fa=a.room.fighters.find(e=>e.id===f.id),fb=b.room.fighters.find(e=>e.id===f.id)
     if(fa&&fb){const k=clamp((displayAt-a.at)/Math.max(1,b.at-a.at),0,1);x=mix(fa.x,fb.x,k);y=mix(fa.y,fb.y,k)}
    }
    positions.set(f.id,{x,y})
    g.fillStyle='#07090a7a';g.beginPath();g.ellipse(x,ARENA_FLOOR+1,36,6,0,0,Math.PI*2);g.fill()
    const progress=f.attackKind?clamp((t-f.attackAt)/Math.max(.01,f.attackUntil-f.attackAt),0,1):0
    if(f.buffUntil>t){const aura:ArenaFx=f.buffKind==='electric'?'electricAura':f.buffKind==='shadow'?'shadowAura':f.buffKind==='fire'?'fireAura':'bloodAura';fx(g,aura,x,y-100,260,280,t,true,f.facing,.9)}
    if(f.autoDodgeUntil>t)fx(g,'dodge',x,y-105,260,250,t,true,f.facing,.65)
    const prior=puddle.get(f.id)||{active:false,emergeAt:-100}
    const submerged=f.puddleUntil>t&&(!f.attackKind||progress>.55)
    if(prior.active&&!submerged)prior.emergeAt=t
    prior.active=submerged;puddle.set(f.id,prior)
    const controlling=f.puppetUntil>t&&f.health>0&&!(f.attackKind==='special'&&f.specialIndex===0)
    const drawn=animationFrame(p,{...f,x,y,...(controlling?{pose:'idle' as const,vx:0,attackKind:null,puppetUntil:0}:{pose:owned&&input&&intent&&!input.crouch&&!input.guard&&f.pose!=='guard'&&!f.attackKind&&f.onGround&&f.stunUntil<=t&&f.puppetUntil<=t&&f.dodgeUntil<=t?'walk':f.pose})},t,clocks.get(f.id))
    clocks.set(f.id,drawn.clock)
    // A poça é a própria transformação da Lysa, sem uma segunda criatura sobreposta.
    if(submerged)drawFrame(g,{url:'/arena/animations/lysa/combat.webp',row:5,rows:7,frame:4,action:'special1'},x,y,f.facing,p.id)
    else if(p.id==='lysa'&&!f.attackKind&&t-prior.emergeAt<.25)drawFrame(g,{url:'/arena/animations/lysa/combat.webp',row:5,rows:7,frame:Math.min(5,3+Math.floor((t-prior.emergeAt)*12)),action:'special1'},x,y,f.facing,p.id)
    else {
     if(drawFrame(g,drawn.sample,x,y,f.facing,p.id,f.buffUntil>t&&f.buffKind==='electric',t))previousFrames.set(f.id,drawn.sample)
     else {
      const previous=previousFrames.get(f.id)||animationFrame(p,{...f,pose:'idle',vx:0,attackKind:null,puppetUntil:0,health:Math.max(1,f.health),onGround:true},t).sample
      drawFrame(g,previous,x,y,f.facing,p.id,f.buffUntil>t&&f.buffKind==='electric',t)
     }
    }
    canvas.dataset.animation=drawn.sample.action
    if(f.attackKind&&room.phase==='playing')once('attack:'+f.id+':'+f.attackAt,attackAudioCue(f.alterLysa?'alter-lysa':p.id,f.attackKind,f.specialIndex),x)
    if(f.alterLysa&&(f.euphoriaState==='transforming'||f.euphoriaState==='reverting')&&room.phase==='playing')once('alter:'+f.id+':'+f.euphoriaState+':'+f.euphoriaAt,f.euphoriaState==='transforming'?'world:alter-transform':'world:alter-revert',x)
    if(drawn.sample.action==='jump')once('jump:'+f.id+':'+drawn.clock.at,'world:jump',x)
    if(drawn.sample.action==='fall')once('fall:'+f.id+':'+drawn.clock.at,'world:fall',x)
    if((drawn.sample.action==='forward'||drawn.sample.action==='backward')&&f.onGround&&Math.abs(f.vx)>20&&room.phase==='playing'){
     const step=Math.floor((drawn.clock.travel||0)/66)
     if(steps.get(f.id)!==step){steps.set(f.id,step);void arenaAudio.play('world:step:'+stage.id+':'+step%2,x)}
    }
    if(f.puppetUntil>t)fx(g,'puppet',f.puppetX,ARENA_FLOOR-215+Math.sin(t*2.8)*4,420,420,t,true,nearestFacing(room,f.puppetX,f.id),1,f.attackKind?attackAnimationFrame(f.attackKind,t-f.attackAt):0)
    if(f.frozenUntil>t)fx(g,'ice',x,y-95,145,230,t,true,1,.8)
    if(f.rootUntil>t){const source=room.fighters.find(owner=>owner.id===f.lastHitBy),key=source?.characterId==='lysa'?'parasitic':'roots';fx(g,key,x,ARENA_FLOOR,180,140,t,true,1,.9,undefined,true)}
    if(p.id!=='lysa'&&f.attackKind&&f.attackKind!=='special'&&progress>.28&&progress<.85){
     const key=CHARACTER_BASIC_FX[p.id]||'hit',low=f.attackKind==='heavy'||f.attackKind==='lowKick',box=getAttackHitbox({...f,x:f.puppetUntil>t?f.puppetX:x,y},t)
     if(box)fx(g,key,box.x+box.w*.5,box.y+box.h*.5,box.w,low?85:110,(progress-.28)*.85,false,f.facing,.8)
    }
    if(current.debugBoxes){const box=getFighterHurtbox({...f,x,y});g.strokeStyle='#77ddff';g.strokeRect(box.x,box.y,box.w,box.h);const hit=getAttackHitbox({...f,x,y},t);if(hit){g.strokeStyle='#ff7788';g.strokeRect(hit.x,hit.y,hit.w,hit.h)}}
   }
   const firstRoot=new Map<string,number>()
   for(const p of room.projectiles){
    if(t<(p.launchAt||0)&&p.style!=='iceDragon')continue
    if(p.style==='alterClone'){
     drawFrame(g,{url:'/arena/animations/alter-lysa/clone-v11.webp',row:0,rows:1,frame:Math.floor((t-(p.launchAt||0))*9)%6,action:'forward'},p.x+p.vx*lag,p.y,Math.sign(p.vx)||1,'lysa')
     continue
    }
    if(p.style==='root'){if(firstRoot.has(p.ownerId))continue;firstRoot.set(p.ownerId,p.id)}
    const key=(p.style||'fire') as ArenaFx
    if(!(key in FX_ROWS))continue
    const dimensions=p.style==='iceDragon'?[432,360]:p.style==='ice'?[130,215]:p.style==='shadow'?[150,205]:p.style==='tornado'?[180,240]:p.style==='chain'?[250,95]:p.style==='bullet'?[65,35]:p.style==='blood'?[140,80]:p.style==='root'?[270,170]:[155,155]
    const effectY=p.style==='root'?ARENA_FLOOR:p.y
    fx(g,key,p.x+(t>=(p.launchAt||0)?p.vx*lag:0),effectY,dimensions[0],dimensions[1],t-(p.launchAt||0)+(p.style==='iceDragon'?.14:0),true,Math.sign(p.vx)||1,1,undefined,p.style==='root')
   }
   for(const e of room.effects){
    const duration=e.kind==='skill'?.85:e.kind==='dust'?.3:e.kind==='ko'?1:.4,elapsed=duration-(e.expiresAt-t)
    if(elapsed<0||e.expiresAt<=t)continue
    if(e.style==='alterBurst'){
     once('alterBurst:'+e.id,'world:alter-burst',e.x);continue
    }
    if(e.kind==='hit'||e.kind==='guard'||e.kind==='ko'){
     fx(g,e.kind==='guard'?'guard':'hit',e.x,e.y,125*(e.power||1),125*(e.power||1),elapsed)
     once('effect:'+e.id,e.kind==='guard'?'world:guard':e.kind==='ko'?'world:fall':'world:hit',e.x)
    }else if(e.kind==='dust')fx(g,'dust',e.x,ARENA_FLOOR,125,60,elapsed,false,1,1,undefined,true)
    else {
     const key=effectKey(e.style);if(!key)continue
     if(key==='devour'||key==='puddle'||key==='fireAura'||e.style==='lysa:1'||e.style==='lysa:2'||e.style==='hands'||e.style==='fateHands')continue
     // Campos e projéteis já possuem suas próprias sequências contínuas.
     if(['darkness','gravityPull','cage','barrier','blizzard','roots','fateHands','shadow','fire','ice','iceDragon','blood','chain','tornado','root','puppet'].includes(key)&&e.style?.includes(':'))continue
     const [w,h,dx,dy]=castDimensions[key]||[230,220,0,0]
     fx(g,key,e.x+(e.facing||1)*dx,e.y+dy,w,h,elapsed,false,e.facing||1)
     if(key==='revive')once('revive:'+e.id,'world:revive',e.x)
    }
   }
   if(heard.size>600)heard.clear()
   g.restore()
   if(room.roundStatus==='intro'||room.roundStatus==='ko'){
    const remaining=room.nextRoundAt-t,text=room.roundStatus==='ko'?'K.O.':remaining<=ARENA_GO_CLEAR_SECONDS?'':remaining<=.8?'LUTEM!':'ROUND '+room.rounds
    canvas.dataset.intro=text||'ready'
    if(room.roundStatus==='intro'){
     once('round:'+room.rounds,'world:round')
     if(remaining<=.8)once('fight:'+room.rounds,'world:fight')
     const reveal=clamp((2.6-remaining)/.55,0,1)
     if(reveal<1){g.fillStyle='#10101b';const cover=logicalWidth*.5*(1-reveal);g.fillRect(0,0,cover,540);g.fillRect(logicalWidth-cover,0,cover,540);g.fillStyle='#dfbc7f';g.fillRect(cover-3,0,3,540);g.fillRect(logicalWidth-cover,0,3,540)}
    }
    if(text){g.textAlign='center';g.font='italic 900 '+Math.min(70,logicalWidth/6)+'px Arial';g.lineWidth=3;g.strokeStyle='#1e131b';g.fillStyle='#f1d8b1';g.strokeText(text,logicalWidth/2,257);g.fillText(text,logicalWidth/2,257)}
   }else{
    canvas.dataset.intro='fight'
   }
   if(current.debugBoxes){g.textAlign='left';g.font='12px monospace';g.fillStyle='#fff';g.fillText((canvas.dataset.fps||'60')+' FPS · '+arenaImageCount()+' ATLAS EM CACHE',15,25)}
  }
  frame=requestAnimationFrame(render)
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock)}
 },[])
 return <canvas className="arena-canvas" ref={canvasRef} width={ARENA_WIDTH} height={ARENA_HEIGHT} aria-label="Combate 2D Morte Mágica: Arena" onPointerDown={event=>{void arenaAudio.unlock();if(event.button===0||event.button===2){event.preventDefault();props.onPointerAttack(event.button===0?'light':'heavy',true);event.currentTarget.setPointerCapture(event.pointerId)}}} onPointerUp={event=>props.onPointerAttack(event.button===0?'light':'heavy',false)} onPointerCancel={()=>{props.onPointerAttack('light',false);props.onPointerAttack('heavy',false)}} onContextMenu={event=>event.preventDefault()}/>
}
function nearestFacing(room:ArenaSnapshot,x:number,id:string){const owner=room.fighters.find(f=>f.id===id),e=room.fighters.filter(f=>owner&&arenaOpponents(room,owner,f)&&!f.withdrawn&&f.health>0&&f.swallowedUntil<=room.gameTime&&f.puddleUntil<=room.gameTime).sort((a,b)=>Math.hypot(a.x-x,a.y-ARENA_FLOOR)-Math.hypot(b.x-x,b.y-ARENA_FLOOR)||a.id.localeCompare(b.id))[0];return e&&Math.abs(e.x-x)>8?(e.x<x?-1:1):owner?.facing||1}
