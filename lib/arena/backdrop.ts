import {ARENA_FLOOR,ARENA_HEIGHT,ARENA_WIDTH} from './model'
/** Panorama preso ao mundo: somente a transforma??o da c?mera move o cen?rio. */
export function arenaBackdrop(imageWidth:number,imageHeight:number,_viewportWidth:number,_camera:{x:number;zoom:number}){
 const ratio=imageWidth/imageHeight,height=Math.max(ARENA_FLOOR/.84,(ARENA_HEIGHT-ARENA_FLOOR)/.16,(ARENA_WIDTH+192)/ratio),width=height*ratio
 return{worldHeight:height,worldWidth:width,width,height,top:ARENA_FLOOR-height*.84,bottom:ARENA_FLOOR+height*.16,ground:ARENA_FLOOR,viewportHeight:ARENA_HEIGHT,tiles:[{x:(ARENA_WIDTH-width)/2,mirror:false}]}
}
