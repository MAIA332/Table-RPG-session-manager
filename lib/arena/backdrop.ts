import {ARENA_FLOOR,ARENA_HEIGHT,ARENA_WIDTH} from './model'
/** One image spans a local stretch of stage, rather than inflating to the entire arena.
 * Mirrored edge panels extend the same artwork continuously across the wider field. */
export function arenaBackdrop(imageWidth:number,imageHeight:number,viewportWidth:number,camera:{x:number;zoom:number}){
 const worldHeight=ARENA_FLOOR/.83,worldWidth=worldHeight*imageWidth/imageHeight,width=worldWidth*camera.zoom,height=worldHeight*camera.zoom,top=ARENA_FLOOR-height*.83
 const center=(ARENA_WIDTH-worldWidth)/2,first=Math.floor((camera.x-center)/worldWidth)-1,last=Math.ceil((camera.x+viewportWidth/camera.zoom-center)/worldWidth)+1
 const tiles=Array.from({length:last-first+1},(_,i)=>{const index=first+i;return{x:(center+index*worldWidth-camera.x)*camera.zoom,mirror:Math.abs(index)%2===1}})
 return{worldHeight,worldWidth,width,height,top,bottom:top+height,ground:ARENA_FLOOR,viewportHeight:ARENA_HEIGHT,tiles}
}
