/** Sprites pixel-art originais e determinísticos da arena.
 * 6 quadros por ação, cache por ficha, sem imagem por frame nem dependências externas.
 * Retrato da ficha identifica o rosto; movimentos e armas mudam a silhueta inteira. */
import type {FighterPose,ArenaPortrait} from '@/lib/arena/model'
export const POSES:FighterPose[]=['idle','walk','jump','crouch','guard','dash','light','heavy','special','hit','ko','win']
export const FRAME_W=84,FRAME_H=116,FRAMES_PER_POSE=6
export type SpriteAtlas={canvas:HTMLCanvasElement;frameWidth:number;frameHeight:number}
type Paint=CanvasRenderingContext2D
const palettes=[
 ['#192a35','#365a72','#6bb9d0','#d6ac86','#ecdfbb'],
 ['#302338','#683d55','#f2a86b','#dbc09e','#ffe3c1'],
 ['#282744','#545b92','#b3a5ef','#c9a98b','#f2dec1'],
 ['#1d3530','#34685b','#93c9a0','#d8b28f','#f6e3bd'],
 ['#412b2c','#954c46','#eebc70','#d5a385','#eed3b4'],
 ['#32343a','#65717e','#cae2d9','#bda88f','#f0d9b5'],
]
function px(g:Paint,x:number,y:number,w:number,h:number,color:string){g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))}
function polygon(g:Paint,coords:number[],color:string){g.fillStyle=color;g.beginPath();g.moveTo(coords[0],coords[1]);for(let i=2;i<coords.length;i+=2)g.lineTo(coords[i],coords[i+1]);g.closePath();g.fill()}
function limb(g:Paint,x:number,y:number,x2:number,y2:number,width:number,edge:string,fill:string){
 g.strokeStyle=edge;g.lineWidth=width+4;g.lineCap='square';g.beginPath();g.moveTo(x,y);g.lineTo(x2,y2);g.stroke()
 g.strokeStyle=fill;g.lineWidth=width;g.beginPath();g.moveTo(x,y);g.lineTo(x2,y2);g.stroke()
}
function head(g:Paint,x:number,y:number,face:HTMLCanvasElement|null,colors:string[],seed:number){
 const [outline,cloth,highlight,skin,light]=colors
 px(g,x-2,y-3,31,33,outline);px(g,x+1,y,26,26,skin)
 if(face){g.imageSmoothingEnabled=false;g.drawImage(face,x+2,y+2,24,23)}
 else {px(g,x+9,y+13,5,3,outline);px(g,x+20,y+13,5,3,outline);px(g,x+13,y+21,8,2,cloth)}
 // máscara/capuz com faixa e cabelo variável por personagem.
 if(seed%3===0){polygon(g,[x-3,y+14,x-3,y+1,x+3,y-5,x+25,y-5,x+30,y+5,x+27,y+11,x+19,y+2,x+6,y+4],outline);px(g,x+2,y-2,23,4,cloth)}
 else if(seed%3===1){polygon(g,[x-3,y+12,x+1,y-7,x+14,y-10,x+29,y-3,x+30,y+9,x+24,y+3,x+18,y,x+12,y+5,x+3,y+4],outline);px(g,x+2,y-4,23,4,highlight)}
 else{polygon(g,[x-3,y+8,x+4,y-6,x+18,y-9,x+29,y-2,x+29,y+13,x+24,y+4,x+8,y+2],cloth);px(g,x+2,y-3,16,4,outline)}
 px(g,x,y+9,4,15,outline);px(g,x+24,y+10,4,14,outline)
 px(g,x+23,y+18,4,2,light)
}
function drawWeapon(g:Paint,x:number,y:number,style:ArenaPortrait['weaponStyle'],angle:number,edge:string,accent:string,light:string,attack:boolean){
 g.save();g.translate(Math.round(x),Math.round(y));g.rotate(angle)
 if(style==='blade'){
  px(g,-3,-5,7,13,edge);px(g,-2,-12,5,12,'#94734d');px(g,-10,-10,20,5,accent)
  polygon(g,[-5,-13,-4,-60,0,-73,5,-60,5,-13],edge)
  polygon(g,[-2,-18,-1,-62,1,-68,3,-59,2,-18],light)
  px(g,-5,-16,2,21,'#799eaa')
 }else if(style==='staff'){
  px(g,-4,-66,8,92,edge);px(g,-2,-64,4,88,'#ba8f62')
  px(g,-9,-77,18,17,edge);px(g,-6,-75,12,11,accent);px(g,-3,-81,6,7,light)
  if(attack){px(g,-12,-79,24,3,light);px(g,-2,-90,4,12,accent)}
 }else if(style==='bow'){
  limb(g,-7,-64,8,-12,3,edge,'#b98e60');limb(g,8,-12,-7,29,3,edge,'#b98e60')
  limb(g,-7,-64,-7,29,1,edge,light)
  if(attack){px(g,-7,-15,48,3,light);polygon(g,[44,-14,34,-19,34,-9],accent)}
 }else{
  px(g,-5,-9,15,16,edge);px(g,-3,-7,12,11,accent);px(g,0,-5,6,4,light)
 }
 g.restore()
}
function frame(g:Paint,pose:FighterPose,index:number,face:HTMLCanvasElement|null,paletteIndex:number,seed:number,weapon:ArenaPortrait['weaponStyle']){
 const colors=palettes[paletteIndex%palettes.length], [edge,cloth,accent,skin,light]=colors
 const t=index/5,active=pose==='light'||pose==='heavy'||pose==='special',jump=pose==='jump',walk=pose==='walk'
 const dash=pose==='dash',crouch=pose==='crouch',guard=pose==='guard',recoil=pose==='hit'
 const action=active?index>=2&&index<=4:false
 const lean=pose==='light'?(index>=2?9:-5):pose==='heavy'?(index>=3?11:-7):pose==='special'?(index>=3?9:-1):dash?9:recoil?-8:0
 const bob=walk?[0,-3,-5,-2,1,0][index]:pose==='idle'?[0,-1,-2,-2,-1,0][index]:0
 const crouchOffset=crouch?17:guard?4:0
 const rise=jump?-11:dash?-4:0
 if(pose==='ko'){
  // KO tem desenho de corpo horizontal próprio: sem rotacionar arma/cabeça, evitando clipping.
  px(g,10,96,67,5,'#0c131b');px(g,33,83,39,14,edge);px(g,35,84,30,9,cloth)
  px(g,50,88,19,4,accent);px(g,66,92,13,4,cloth)
  limb(g,53,86,77,102,7,edge,cloth);limb(g,33,91,13,103,7,edge,cloth)
  head(g,8,70,face,colors,seed);px(g,16,102,18,4,accent)
  if(weapon==='blade')px(g,49,73,32,3,light)
  if(weapon==='staff')px(g,44,69,3,33,'#a78c70')
  return
 }
 g.save();g.translate(lean,rise+bob+crouchOffset)
 // Rastro/capa atrás, oscilando de modo diferente entre walk e dash.
 const tail=dash?17:active?5+index*3:walk?[5,9,12,6,0,-2][index]:index%2?4:0
 polygon(g,[23,40,34,42,28,78,7-tail,91,10-tail,65],edge)
 polygon(g,[19,48,29,50,23,72,12-tail,85,14-tail,64],cloth)
 // Pernas independentes: passada larga, pulo com joelhos erguidos e impacto no piso.
 const stride=walk?[0,8,12,3,-9,-12][index]:dash?index*3:active?(index>=3?7:-5):0
 const foot=jump?-14:0
 limb(g,35,74,33+stride,95+foot,10,edge,cloth)
 limb(g,51,73,56-stride,95+(jump?-9:0),10,edge,cloth)
 px(g,21+stride,97+foot,17,8,edge);px(g,47-stride,97+(jump?-9:0),19,8,edge)
 px(g,23+stride,98+foot,14,3,accent);px(g,48-stride,98+(jump?-9:0),18,3,accent)
 // Peitoral com ombreiras e cinto; 8-12 pixels de espessura dão silhueta nítida.
 px(g,24,39,35,41,edge);px(g,27,42,29,34,cloth)
 polygon(g,[24,42,35,42,48,63,41,67],accent)
 px(g,31,62,24,5,edge);px(g,37,62,8,6,accent);px(g,40,64,5,3,light)
 px(g,22,42,13,10,edge);px(g,25,44,8,5,accent)
 px(g,51,42,13,10,edge);px(g,52,44,8,5,accent)
 if(seed%3===0){px(g,29,47,6,12,'#8baeb3');px(g,31,49,2,9,light)}
 if(seed%3===1)polygon(g,[29,48,34,45,49,62,45,64],light)
 // Membros variam com os 6 quadros, antecipação, contato e recuperação.
 let frontX=64,frontY=70,backX=18,backY=70
 if(pose==='light'){
  frontX=[56,61,79,82,68,58][index];frontY=[73,69,55,52,62,69][index]
  backX=[15,12,15,18,21,19][index];backY=[70,70,65,65,71,73][index]
 }else if(pose==='heavy'){
  frontX=[52,45,56,71,85,60][index];frontY=[51,28,11,26,47,68][index]
  backX=[17,13,16,20,25,19][index];backY=[68,57,52,59,63,70][index]
 }else if(pose==='special'){
  frontX=[55,63,70,83,90,70][index];frontY=[57,52,50,54,58,65][index]
  backX=[17,15,8,13,20,18][index];backY=[66,59,52,58,63,70][index]
 }else if(pose==='guard'){
  frontX=58;frontY=36;backX=28;backY=31
 }else if(pose==='jump'){frontX=65;frontY=48;backX=19;backY=46}
 else if(pose==='dash'){frontX=73;frontY=48;backX=10;backY=75}
 else if(recoil){frontX=65;frontY=23;backX=10;backY=29}
 else if(crouch){frontX=60;frontY=68;backX=18;backY=65}
 else if(pose==='win'){frontX=68;frontY=14;backX=19;backY=57}
 else if(walk){frontX=64+(index%3)*2;frontY=65+stride/3;backX=19-(index%3)*3;backY=68-stride/3}
 limb(g,30,47,backX,backY,9,edge,cloth)
 px(g,backX-5,backY-3,11,9,skin)
 head(g,31,8,face,colors,seed)
 // frente do corpo: braço e punho por cima do torso, com arma acompanhando a mão.
 limb(g,56,47,frontX,frontY,10,edge,cloth)
 px(g,frontX-6,frontY-5,13,12,edge);px(g,frontX-3,frontY-3,9,7,skin)
 if(weapon&&weapon!=='fists'){
  let angle=.33
  if(pose==='light')angle=[-.65,-.4,.55,1.0,.7,.22][index]
  else if(pose==='heavy')angle=[-.95,-.5,-.22,1.12,1.52,.25][index]
  else if(pose==='special')angle=[-.1,.35,.65,1.0,.55,.2][index]
  else if(dash)angle=1.1
  else if(guard)angle=-.45
  drawWeapon(g,frontX,frontY,weapon,angle,edge,accent,light,action)
 }else if(active){
  // Soco: ampliado por 2 px no ponto de contato.
  px(g,frontX-7,frontY-6,action?17:13,action?14:12,edge)
  px(g,frontX-4,frontY-4,action?12:9,8,accent)
  if(action)px(g,frontX+9,frontY-1,4,4,light)
 }
 if(pose==='special'){
  const energy=[3,5,8,13,19,8][index]
  px(g,frontX+9,frontY-4,energy,4,accent);px(g,frontX+11,frontY+2,Math.max(3,energy-5),3,light)
  px(g,frontX-2,frontY-12,6,4,light)
 }
 if(recoil){px(g,25,16,7,5,'#f6c58e');px(g,67,40,6,6,'#fbbaa7')}
 if(pose==='win'){px(g,63,9,5,5,light);px(g,70,4,4,5,accent)}
 g.restore()
}
export function createSpriteAtlas(paletteIndex:number,image:HTMLImageElement|null,identity:string,weaponStyle:ArenaPortrait['weaponStyle']='fists'):SpriteAtlas{
 const canvas=document.createElement('canvas');canvas.width=FRAME_W*FRAMES_PER_POSE;canvas.height=FRAME_H*POSES.length
 const g=canvas.getContext('2d')!;g.imageSmoothingEnabled=false
 let hash=0;for(const c of identity)hash=(hash*31+c.charCodeAt(0))|0
 let face:HTMLCanvasElement|null=null
 if(image?.complete&&image.naturalWidth){
  face=document.createElement('canvas');face.width=14;face.height=14
  const fg=face.getContext('2d')!;fg.imageSmoothingEnabled=false
  const side=Math.min(image.naturalHeight,image.naturalWidth)
  fg.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)*.23,side,side,0,0,14,14)
 }
 for(let i=0;i<POSES.length;i++)for(let j=0;j<FRAMES_PER_POSE;j++){
  g.save();g.translate(j*FRAME_W,i*FRAME_H)
  frame(g,POSES[i],j,face,paletteIndex,Math.abs(hash),weaponStyle)
  g.restore()
 }
 return {canvas,frameWidth:FRAME_W,frameHeight:FRAME_H}
}
export function spriteIndex(pose:FighterPose,stamp:number,attackProgress=0):number{
 const base=Math.max(0,POSES.indexOf(pose))*FRAMES_PER_POSE
 const attacking=pose==='light'||pose==='heavy'||pose==='special'
 return base+(attacking?Math.min(FRAMES_PER_POSE-1,Math.floor(attackProgress*FRAMES_PER_POSE)):
   Math.floor(stamp/(pose==='walk'?80:pose==='dash'?65:pose==='jump'?130:pose==='hit'?90:190))%FRAMES_PER_POSE)
}
