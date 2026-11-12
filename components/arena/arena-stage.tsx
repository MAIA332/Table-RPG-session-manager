'use client'
import {useEffect,useRef} from 'react'
import {ARENA_FLOOR,ARENA_HEIGHT,ARENA_WIDTH,GRAVITY,getFighterHurtbox,getAttackHitbox,getProjectileHitbox,type ArenaSnapshot,type ArenaInput,type ArenaEffect,type MoveKind,type FighterPose} from '@/lib/arena/model'
import {createSpriteAtlas,FRAME_W,FRAME_H,spriteIndex,type SpriteAtlas} from './arena-sprites'

type Props={room:ArenaSnapshot;debugBoxes?:boolean;localPlayerId:string;getLocalInput:(device:string)=>ArenaInput|undefined;onPointerAttack:(kind:'light'|'heavy',pressed:boolean)=>void}
const colors=['#e3be7b','#bca8db','#82d3d6','#a2d69a']
/** Cor do efeito acompanha o nome da técnica cadastrada na ficha. */
function moveColors(name:string):[string,string]{
 if(/fogo|flame|inc[eê]nd|chama|inferno|lava|brasa/i.test(name))return ['#ffe09e','#ff6642']
 if(/gelo|ice|frost|neve|frio|glacial/i.test(name))return ['#e0fbff','#58bde9']
 if(/raio|el[eé]tric|thunder|lightning|choque|rel[aâ]mp/i.test(name))return ['#ffffa8','#ffd142']
 if(/sombra|treva|shadow|abiss|escur|vazio/i.test(name))return ['#e6c2ff','#915ad6']
 if(/veneno|poison|toxin|[áa]cid/i.test(name))return ['#dbffa0','#64b863']
 return ['#d7faff','#3cb8db']
}

const px=(g:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string)=>{g.fillStyle=color;g.fillRect(x,y,w,h)}
/** Cenário pixel-art original com pré-render em 480x270 e ampliação nearest neighbor. */
function createBackground():HTMLCanvasElement{
 const c=document.createElement('canvas');c.width=480;c.height=270
 const g=c.getContext('2d',{alpha:false})!;g.imageSmoothingEnabled=false
 px(g,0,0,480,270,'#121b2d')
 const bands=['#1a2740','#25344e','#34415b','#51445c','#755365','#bd7f75']
 bands.forEach((color,i)=>px(g,0,i*21+16,480,25,color))
 // Lua de pixel e nuvens compostas em blocos.
 px(g,348,31,48,48,'#c9b9a3');px(g,342,40,60,30,'#c9b9a3');px(g,353,26,38,57,'#d9c6ac')
 for(let i=0;i<18;i++){
  const x=(i*83+11)%475,y=17+(i*47)%107
  px(g,x,y,5+(i%4)*5,3,'#1b2940');px(g,x+5,y-3,15,3,'#23324d')
 }
 // Cidade de magia antiga ao fundo, janelas e telhados.
 for(let i=0;i<24;i++){
  const x=i*24-10,top=90+(i*37)%37
  px(g,x,top,22,124-top,'#222b3b');px(g,x+3,top-5,16,5,'#1c2737')
  for(let y=top+9;y<125;y+=12)for(let z=3;z<21;z+=9)if((i+y+z)%3!==0)px(g,x+z,y,3,4,'#a5846d')
 }
 // Silhuetas do público em fileiras, detalhes em módulos para não usar imagens externas.
 px(g,0,133,480,47,'#172331');px(g,0,130,480,4,'#738092')
 for(let i=0;i<132;i++){
  const x=(i*37)%480,y=137+(i*19)%31,color=i%5===0?'#7e6570':i%3===0?'#3d5362':'#314457'
  px(g,x,y,5,5,color);px(g,x-2,y+5,9,11,color)
  if(i%8===0)px(g,x+2,y-2,2,2,'#cdb48b')
 }
 // Templo com arquibancadas e arcos pixelados.
 for(let x=0;x<480;x+=82){
  px(g,x,117,11,88,'#171c2b');px(g,x+2,119,3,84,'#5c5164');px(g,x-4,113,19,7,'#a68b76')
 }
 px(g,0,175,480,9,'#6b5460');px(g,0,182,480,5,'#bc9277')
 // Piso de pedra com perspectiva e placas.
 px(g,0,187,480,83,'#333a48');px(g,0,223,480,47,'#252b37')
 px(g,0,224,480,3,'#c2a17c');px(g,0,187,480,3,'#ad8070')
 for(let y=191;y<270;y+=16){
  px(g,0,y,480,1,'#646070')
  for(let x=(y%32?0:18);x<480;x+=38)px(g,x,y+2,2,14,'#1b2632')
 }
 for(let x=0;x<480;x+=24)px(g,x,231,8,2,'#827076')
 // Emblema central do ringue, de frente e não por cima dos personagens.
 px(g,214,239,52,2,'#8d746b');px(g,218,245,44,2,'#765f64')
 px(g,234,232,12,5,'#a88a7e');px(g,237,229,6,13,'#d6ac84')
 return c
}
/** Cena 60 FPS em Canvas, separada da autoridade do servidor.
 * Usa predição curta somente para desenho local: HP/hitboxes/dano sempre do servidor. */
export function ArenaStage({room,debugBoxes=false,localPlayerId,getLocalInput,onPointerAttack}:Props){
 const canvasRef=useRef<HTMLCanvasElement>(null)
 const current=useRef(room);current.current=room
 const debug=useRef(debugBoxes);debug.current=debugBoxes
 const arrived=useRef(0)
 const signature=useRef(room)
 if(signature.current!==room){signature.current=room;arrived.current=typeof performance!=='undefined'?performance.now():0}
 const atlas=useRef(new Map<string,{asset:SpriteAtlas;image:HTMLImageElement|null;src:string;weapon:string;palette:number}>())
 const smooth=useRef(new Map<string,{x:number;y:number}>())
 const localCues=useRef(new Map<string,{pose:FighterPose;at:number;lastLight:boolean;lastHeavy:boolean;lastSpecial:boolean;lastJump:boolean}>())
 const seenEffects=useRef(new Map<number,number>())
 const sound=useRef<AudioContext|null>(null)
 const lastGameTime=useRef(0)
 useEffect(()=>{
  const canvas=canvasRef.current,ctx=canvas?.getContext('2d',{alpha:false})
  if(!canvas||!ctx)return
  const background=createBackground()
  const unlockSound=()=>{
   if(!sound.current){const Audio=(window.AudioContext || (window as typeof window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext)
    if(Audio)try{sound.current=new Audio()}catch{/** dispositivo sem áudio */}}
   if(sound.current?.state==='suspended')void sound.current.resume().catch(()=>{})
  }
  window.addEventListener('keydown',unlockSound,{capture:true});window.addEventListener('pointerdown',unlockSound,{capture:true})
  const playImpact=(kind:string,power:number)=>{
   const audio=sound.current;if(!audio||audio.state!=='running')return
   try{
    const at=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain()
    osc.type=kind==='guard'?'triangle':kind==='burst'?'sawtooth':'square'
    const pitch=kind==='guard'?240:kind==='burst'?160:95+Math.min(power,2)*35
    osc.frequency.setValueAtTime(pitch,at)
    osc.frequency.exponentialRampToValueAtTime(Math.max(35,pitch*.34),at+.1)
    gain.gain.setValueAtTime(.0001,at)
    gain.gain.exponentialRampToValueAtTime(Math.min(.08,.022+.022*power),at+.008)
    gain.gain.exponentialRampToValueAtTime(.0001,at+.13)
    osc.connect(gain);gain.connect(audio.destination);osc.start(at);osc.stop(at+.14)
   }catch{/** silêncio opcional */}
  }
  let handle=0,lastPaint=0,screenWidth=ARENA_WIDTH
  let lastWidth=0,lastHeight=0
  const fit=()=>{
   const parent=canvas.parentElement
   if(!parent)return
   const bounds=parent.getBoundingClientRect()
   const logicalW=Math.max(ARENA_WIDTH,Math.min(2304,Math.round((bounds.width/Math.max(1,bounds.height))*ARENA_HEIGHT)))
   if(Math.abs(logicalW-screenWidth)>3){screenWidth=logicalW;canvas.width=screenWidth;ctx.imageSmoothingEnabled=false}
   lastWidth=bounds.width;lastHeight=bounds.height
  }
  fit()
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(fit)
  if(canvas.parentElement)observer?.observe(canvas.parentElement)
  const drawImpact=(e:ArenaEffect,at:number)=>{
   const duration=e.kind==='dust'?230:e.kind==='ko'?750:450
   const k=Math.max(0,Math.min(1,(at-seenEffects.current.get(e.id)!)/duration))
   const p=e.power||1
   ctx.save();ctx.translate(Math.round(e.x),Math.round(e.y))
   if(e.kind==='dust'){
    for(let i=0;i<7;i++){
     const dx=(i-3)*11*(1+k),dy=-(i%3+1)*k*16
     px(ctx,dx,dy,8+Math.floor((1-k)*8),4+Math.floor((1-k)*5),i%2?'#e5cfab99':'#b99e8299')
    }
   }else{
    const hue=e.kind==='guard'?'#8deaff':e.kind==='ko'?'#ff9884':e.kind==='burst'?'#d6a9ff':'#fff1bf'
    const warm=e.kind==='guard'?'#367f9b':e.kind==='burst'?'#8749af':'#ff9b58'
    const r=12+(1-k)*p*19
    // Estilhaços em 8 direções. Sem blur, legíveis mesmo ampliados por nearest-neighbor.
    for(let i=0;i<12;i++){
     const a=i*Math.PI/6+e.id*.31,dist=r+(1-k)*12
     ctx.save();ctx.rotate(a)
     px(ctx,dist,-3,Math.max(3,Math.floor((1-k)*20*p)),6,hue)
     px(ctx,dist+8,-1,Math.max(2,Math.floor((1-k)*14*p)),3,warm)
     ctx.restore()
    }
    if(k<.5){px(ctx,-10*(1-k),-10*(1-k),20*(1-k),20*(1-k),'#fffaf0');px(ctx,-5,-5,10,10,hue)}
   }
   ctx.restore()
  }
  const paint=(now:number)=>{
   handle=requestAnimationFrame(paint)
   if(document.visibilityState==='hidden')return
   const snapshot=current.current
   if(now-lastPaint<(snapshot.phase==='paused'?100:1000/60))return
   const dt=Math.min(.05,Math.max(0,(now-lastPaint)/1000));lastPaint=now
   // Defesa contra relógio reiniciado na revanche e snapshots antigos.
   if(snapshot.gameTime+0.4<lastGameTime.current){seenEffects.current.clear();smooth.current.clear();localCues.current.clear()}
   lastGameTime.current=snapshot.gameTime
   const offset=Math.round((screenWidth-ARENA_WIDTH)/2)
   ctx.imageSmoothingEnabled=false
   // Cenário estendido nas laterais do fullscreen: elimina bandas pretas.
   ctx.fillStyle='#111a2a';ctx.fillRect(0,0,screenWidth,ARENA_HEIGHT)
   for(let x=offset-ARENA_WIDTH;x<screenWidth;x+=ARENA_WIDTH)ctx.drawImage(background,x,0,ARENA_WIDTH,ARENA_HEIGHT)
   ctx.save();ctx.translate(offset,0)
   const roster=new Map(snapshot.roster.map(p=>[p.id,p]))
   const fighters=snapshot.fighters.filter(f=>!f.withdrawn)
   // Efeitos novos alimentam hit sparks, som curto, flash e shake.
   for(const e of snapshot.effects){
    if(!seenEffects.current.has(e.id)){
     seenEffects.current.set(e.id,now)
     if(e.kind==='hit'||e.kind==='guard'||e.kind==='burst'||e.kind==='ko')playImpact(e.kind,e.power||1)
    }
   }
   for(const [id,at] of seenEffects.current)if(now-at>850)seenEffects.current.delete(id)
   const impacts=snapshot.effects.filter(e=>['hit','ko','burst'].includes(e.kind)&&now-(seenEffects.current.get(e.id)||0)<160)
   const shake=impacts.reduce((a,e)=>Math.max(a,(e.power||1)*2.5),0)
   if(shake){const strength=shake*Math.max(0,1-(now-(seenEffects.current.get(impacts[0].id)||now))/160)
    ctx.translate(Math.round(Math.sin(now*.13)*strength),Math.round(Math.cos(now*.18)*strength))}
   for(const [i,f] of fighters.entries()){
    const character=roster.get(f.characterId||''),key=f.id
    const src=character?.imageUrl||'',weapon=character?.weaponStyle||'fists'
    const palette=i%6
    let sprite=atlas.current.get(key)
    if(!sprite||sprite.src!==src||sprite.weapon!==weapon||sprite.palette!==palette){
     const image=src?new Image():null
     sprite={src,weapon,image,palette,asset:createSpriteAtlas(palette,null,key,character?.weaponStyle)}
     atlas.current.set(key,sprite)
     if(image){image.onload=()=>{const cached=atlas.current.get(key)
       if(cached&&cached.src===src)cached.asset=createSpriteAtlas(palette,image,key,character?.weaponStyle)}
      image.onerror=()=>{image.onload=null};image.src=src}
    }
    const lag=snapshot.phase==='playing'?Math.min(.09,Math.max(0,(now-arrived.current)/1000)):0
    const owned=!f.bot&&f.userId===localPlayerId&&snapshot.phase==='playing'
    const live=owned?getLocalInput(f.device):undefined
    const intent=live?Number(live.right)-Number(live.left):0
    const speed=character?.speed||210
    const fighting=f.attackKind&&snapshot.gameTime<f.attackUntil
    const predictable=owned&&snapshot.roundStatus==='fight'&&f.stunUntil<=snapshot.gameTime&&!fighting&&!live?.guard
    const vx=predictable&&intent?intent*speed:f.vx
    const projectedX=Math.max(27,Math.min(ARENA_WIDTH-27,f.x+vx*lag))
    const projectedY=Math.min(ARENA_FLOOR,f.y+f.vy*lag+(f.onGround?0:.5*GRAVITY*lag*lag))
    const previous=smooth.current.get(f.id)
    const x=previous&&Math.abs(previous.x-projectedX)<95?previous.x+(projectedX-previous.x)*(owned ? .82 : .58):projectedX
    const y=previous&&Math.abs(previous.y-projectedY)<110?previous.y+(projectedY-previous.y)*(owned ? .8 : .60):projectedY
    smooth.current.set(f.id,{x,y})
    const dx=Math.round(x),dy=Math.round(y)
    // Pistas locais do golpe não alteram o HP, colisão nem a simulação online.
    let visualPose=f.pose
    let progress=fighting?Math.max(0,Math.min(1,(snapshot.gameTime+lag-f.attackAt)/Math.max(.01,f.attackUntil-f.attackAt))):0
    if(owned&&live){
     const prior=localCues.current.get(f.id)||{pose:'idle' as FighterPose,at:0,lastLight:false,lastHeavy:false,lastSpecial:false,lastJump:false}
     const action:MoveKind|null=live.special&&!prior.lastSpecial?'special':live.heavy&&!prior.lastHeavy?'heavy':live.light&&!prior.lastLight?'light':null
     if(action&&f.stunUntil<=snapshot.gameTime){prior.pose=action;prior.at=now}
     if(live.jump&&!prior.lastJump&&f.onGround){prior.pose='jump';prior.at=now}
     prior.lastLight=!!live.light;prior.lastHeavy=!!live.heavy;prior.lastSpecial=!!live.special;prior.lastJump=!!live.jump
     localCues.current.set(f.id,prior)
     if(!fighting&&f.stunUntil<=snapshot.gameTime&&now-prior.at<190&&snapshot.roundStatus==='fight'){
      visualPose=prior.pose;progress=Math.min(1,(now-prior.at)/185)
     }else if(predictable&&intent){visualPose=f.onGround?'walk':'jump'}
     else if(predictable&&live.guard){visualPose='guard'}
    }
    // Sombra e pós-imagens acompanham dash e golpe especial.
    px(ctx,dx-34,ARENA_FLOOR-4,68,8,'#08121ab0')
    if(visualPose==='dash'||visualPose==='special')for(let trail=3;trail>=1;trail--){
     ctx.globalAlpha=.075*trail
     const delta=f.facing*(trail*11+6)
     const fidx=spriteIndex(visualPose,now-trail*80,progress)
     ctx.save();ctx.translate(dx-delta,dy);if(f.facing<0)ctx.scale(-1,1)
     ctx.drawImage(sprite.asset.canvas,(fidx%6)*FRAME_W,Math.floor(fidx/6)*FRAME_H,FRAME_W,FRAME_H,-70,-174,140,190);ctx.restore()
    }
    ctx.globalAlpha=f.invincibleUntil>snapshot.gameTime&&Math.floor(now/75)%2===0?.5:1
    const frame=spriteIndex(visualPose,now,progress)
    ctx.save();ctx.translate(dx,dy)
    if(f.facing<0)ctx.scale(-1,1)
    ctx.drawImage(sprite.asset.canvas,(frame%6)*FRAME_W,Math.floor(frame/6)*FRAME_H,FRAME_W,FRAME_H,-70,-174,140,190)
    ctx.restore();ctx.globalAlpha=1
    const doingAttack=visualPose==='light'||visualPose==='heavy'||visualPose==='special'
    if(doingAttack&&progress>.25&&progress<.84){
     ctx.save();ctx.translate(dx,dy-100);if(f.facing<0)ctx.scale(-1,1)
     const strong=visualPose==='special',heavy=visualPose==='heavy'
     const reach=strong?132:heavy?110:85
     const specialName=character?.moves.find(m=>m.kind==='special')?.name||''
     const [magicCore,magicEdge]=moveColors(specialName)
     const hue=strong?magicCore:heavy?'#f8d2a1':'#fdf5df'
     const accent=strong?magicEdge:heavy?'#ed9a57':'#d2bda3'
     const arcY=heavy?-30:strong?-10:18
     for(let j=0;j<7;j++){
      const q=j/6,pxx=26+q*reach,pyy=arcY-35*Math.sin(q*Math.PI)
      const width=strong?13:heavy?10:6
      px(ctx,pxx,pyy,width*(1-q*.5),5+j%3*3,j%2?accent:hue)
     }
     for(let j=0;j<5;j++){px(ctx,64+j*12,arcY+8+(j%2)*9,10,3,hue)}
     if(strong){px(ctx,reach+28,arcY-19,18,18,hue);px(ctx,reach+33,arcY-14,8,8,'#fff')}
     ctx.restore()
    }
    const avatar=character?.name||f.name
    ctx.textAlign='center';ctx.font='bold 12px monospace'
    ctx.fillStyle='#0a1016';ctx.fillText(avatar.slice(0,18).toUpperCase(),dx+2,dy-197)
    ctx.fillStyle=colors[i%colors.length];ctx.fillText(avatar.slice(0,18).toUpperCase(),dx,dy-199)
    const actionLabel=visualPose==='light'?'RÁPIDO':visualPose==='heavy'?'FORTE':visualPose==='special'?'ESPECIAL':visualPose==='guard'?'DEFESA':visualPose==='hit'?'ACERTOU!':visualPose==='jump'?'PULO':null
    if(actionLabel&&snapshot.phase==='playing'){
     ctx.font='bold 13px monospace';ctx.fillStyle='#0c1323';ctx.fillText(actionLabel,dx+2,dy-218)
     ctx.fillStyle=visualPose==='hit'?'#fba58f':visualPose==='special'?'#9defff':'#f5d49d';ctx.fillText(actionLabel,dx,dy-220)
    }
    if(f.combo>=2&&f.comboUntil>snapshot.gameTime){
     ctx.textAlign='center';ctx.font='bold 35px monospace';ctx.fillStyle='#090c15';ctx.fillText(`${f.combo} HITS!`,dx+3,dy-239)
     ctx.fillStyle='#ffd26f';ctx.fillText(`${f.combo} HITS!`,dx,dy-242)
    }
    if(debug.current){
     const hurt=getFighterHurtbox({...f,x,y});ctx.lineWidth=2;ctx.strokeStyle='#70c9e9';ctx.fillStyle='#70c9e930';ctx.fillRect(hurt.x,hurt.y,hurt.w,hurt.h);ctx.strokeRect(hurt.x,hurt.y,hurt.w,hurt.h)
     const hit=getAttackHitbox({...f,x,y},snapshot.gameTime+lag,character?.moves.find(m=>m.kind===f.attackKind)?.range)
     if(hit){ctx.fillStyle='#ea665b4a';ctx.strokeStyle='#ff756b';ctx.fillRect(hit.x,hit.y,hit.w,hit.h);ctx.strokeRect(hit.x,hit.y,hit.w,hit.h)}
    }
   }
   for(const p of snapshot.projectiles){
    const x=p.x+p.vx*Math.min(.07,Math.max(0,(now-arrived.current)/1000)),y=p.y
    const dir=Math.sign(p.vx)||1
    const owner=fighters.find(f=>f.id===p.ownerId)
    const name=roster.get(owner?.characterId||'')?.moves.find(m=>m.kind==='special')?.name||''
    const [core,edge]=moveColors(name)
    for(let n=5;n>=0;n--){const length=22+n*7
      px(ctx,x-dir*(n*9)-length/2,y-10+n%2*3,length,21-n*3,n%2?edge:core)}
    px(ctx,x-14,y-13,28,26,core);px(ctx,x-8,y-8,16,16,'#ffffff')
    if(debug.current){const b=getProjectileHitbox({...p,x});ctx.strokeStyle='#f7898b';ctx.strokeRect(b.x,b.y,b.w,b.h)}
   }
   for(const e of snapshot.effects)if(seenEffects.current.has(e.id))drawImpact(e,now)
   if(impacts.length&&Math.sin(now*.27)>0.65)px(ctx,0,0,ARENA_WIDTH,ARENA_HEIGHT,'#ffffff0a')
   if(snapshot.roundStatus==='intro'&&snapshot.phase!=='finished'){
    px(ctx,0,167,ARENA_WIDTH,136,'#090e19dd');ctx.textAlign='center';ctx.font='bold 65px monospace';ctx.fillStyle='#f3d399';ctx.fillText(`ROUND ${snapshot.rounds}`,480,249)
    ctx.font='bold 18px monospace';ctx.fillStyle='#f8ead7';ctx.fillText('PREPARE-SE!',480,285)
   }else if(snapshot.roundStatus==='ko'&&snapshot.phase!=='finished'){
    px(ctx,0,177,ARENA_WIDTH,124,'#090e19cc');ctx.textAlign='center';ctx.font='bold 86px monospace';ctx.fillStyle='#eaa17c';ctx.fillText('K.O.',480,274)
   }
   if(debug.current){px(ctx,10,10,320,27,'#0c111ddc');ctx.fillStyle='#b5edf7';ctx.font='bold 12px monospace';ctx.textAlign='left';ctx.fillText('F1 · AZUL HURTBOX  VERMELHO HITBOX',17,28)}
   ctx.restore()
  }
  handle=requestAnimationFrame(paint)
  return()=>{cancelAnimationFrame(handle);observer?.disconnect();window.removeEventListener('keydown',unlockSound,true);window.removeEventListener('pointerdown',unlockSound,true)
   atlas.current.forEach(entry=>{if(entry.image)entry.image.onload=null});atlas.current.clear();smooth.current.clear();localCues.current.clear();seenEffects.current.clear()
   if(sound.current){void sound.current.close().catch(()=>{});sound.current=null}}
 },[])
 return <canvas className="otms-arena-canvas" ref={canvasRef} width={ARENA_WIDTH} height={ARENA_HEIGHT} aria-label="Luta pixel art 2D, animações e efeitos de impacto" onPointerDown={event=>{
  if(event.button===0||event.button===2){event.preventDefault();onPointerAttack(event.button===0?'light':'heavy',true);event.currentTarget.setPointerCapture(event.pointerId)}
 }} onPointerUp={event=>{if(event.button===0||event.button===2)onPointerAttack(event.button===0?'light':'heavy',false)}} onPointerCancel={()=>{onPointerAttack('light',false);onPointerAttack('heavy',false)}} onPointerLeave={()=>{onPointerAttack('light',false);onPointerAttack('heavy',false)}} onContextMenu={event=>event.preventDefault()}/>
}
