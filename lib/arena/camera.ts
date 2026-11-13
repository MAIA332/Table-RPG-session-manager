import {ARENA_WIDTH,ARENA_FLOOR} from './model'
export const ARENA_CAMERA_MARGIN=96
/** Todos veem o mesmo campo; a câmera acompanha a dispersão dos até quatro lutadores. */
export function arenaCamera(fighters:readonly {x:number;withdrawn:boolean;health:number}[],viewportWidth:number){
 const present=fighters.filter(f=>!f.withdrawn),xs=present.map(f=>f.x)
 const left=xs.length?Math.min(...xs):ARENA_WIDTH/2,right=xs.length?Math.max(...xs):ARENA_WIDTH/2
 const minimumZoom=viewportWidth/(ARENA_WIDTH+ARENA_CAMERA_MARGIN*2),zoom=Math.max(minimumZoom,Math.min(1,viewportWidth/Math.max(960,right-left+320)))
 const visible=viewportWidth/zoom,x=Math.max(-ARENA_CAMERA_MARGIN,Math.min(ARENA_WIDTH+ARENA_CAMERA_MARGIN-visible,(left+right-visible)/2))
 return {x,zoom,y:ARENA_FLOOR*(1-zoom),screenX:(worldX:number)=>(worldX-x)*zoom}
}
