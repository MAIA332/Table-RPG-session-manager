export const FX_ROWS={
 electricKick:['a',0],electricAura:['a',1],shadowAura:['a',2],shadow:['a',3],darkness:['a',4],dodge:['a',5],fireHands:['a',6],fire:['a',7],
 cage:['b',0],whip:['whip-v6',0],tornado:['b',2],ice:['b',3],blizzard:['b',4],puppet:['puppet-float-v5',0],barrier:['barrier',0],root:['b',7],iceDragon:['ice-dragon-v5',0],
 revive:['c',0],blood:['c',1],claw:['c',2],bloodAura:['c',3],chain:['c',4],bullet:['c',5],blade:['c',6],gravityPull:['c',7],
 repulse:['d',0],gravity:['d',1],roots:['d',2],puddle:['d',3],devour:['d',4],hit:['d',5],guard:['d',6],dust:['d',7],
 horns:['horns',0],fateHands:['fate-hands',0],electricElbow:['a',0],fireAura:['fire-aura-v6',0],parasitic:['lysa-roots-v6',0],
} as const
export type ArenaFx=keyof typeof FX_ROWS
export const CHARACTER_SPECIAL_FX:Record<string,ArenaFx[]>={
 fander:['electricKick','electricAura','electricElbow'],andreas:['shadowAura','shadow','darkness'],lightea:['dodge','fateHands'],maeve:['fireAura','fire'],
 joffrey:['cage','whip','tornado'],valya:['ice','blizzard','iceDragon'],miguel:['puppet','whip','barrier'],amelia:['root','revive'],
 thorfinn:['blood','claw','bloodAura'],loulan:['chain','bullet','blade'],langris:['gravityPull','repulse','gravity'],lysa:['roots','puddle','devour'],
}
export const CHARACTER_BASIC_FX:Record<string,ArenaFx>={fander:'electricKick',andreas:'shadow',lightea:'dodge',maeve:'fire',joffrey:'whip',valya:'ice',miguel:'whip',amelia:'root',thorfinn:'claw',loulan:'blade',langris:'gravity',lysa:'roots'}
export const fxUrl=(atlas:string)=>'/arena/fx/'+(/-v\d+$/.test(atlas)?atlas:atlas.length===1?'attacks-'+atlas:atlas+'-v4')+'.webp'
export const fxRows=(atlas:string)=>atlas.length===1?8:1
export const FX_URLS=[...new Set(Object.values(FX_ROWS).map(([atlas])=>fxUrl(atlas)))]
export const fxFrame=(elapsed:number,persistent=false)=>persistent&&elapsed>.2?2+Math.floor(elapsed*10)%3:Math.max(0,Math.min(5,Math.floor(elapsed*12)))
