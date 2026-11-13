/** Medidas em unidades do mundo; a arte e a simulação usam a mesma referência. */
export const SPRITE_CELL=384,SPRITE_BODY_HEIGHT=200,SPRITE_ANCHOR_X=192,SPRITE_ANCHOR_Y=304
const bodies:Record<string,[number,number]>={
 fander:[190,60],andreas:[198,58],lightea:[172,48],maeve:[174,52],joffrey:[186,55],valya:[178,52],
 miguel:[184,56],amelia:[166,49],lysa:[170,50],thorfinn:[194,64],loulan:[168,48],langris:[192,58],
}
export function fighterDimensions(id?:string|null){const [height,width]=bodies[id||'']||[184,56];return {height,width,scale:height/SPRITE_BODY_HEIGHT}}
export function basicAttackRange(kind:string){return kind==='kick'?152:kind==='lowKick'?138:kind==='heavy'?110:kind==='special'?180:118}
