import type { ArenaMove, ArenaPortrait } from './model'

type NamedAttack = { name?:unknown; targetDefense?:unknown; damage?:unknown; type?:unknown }
type SheetLike = {id:string;name:string;avatarUrl?:string;ownerId?:string;isNpc?:boolean;weaponName?:string;attributes?:{dex?:string;mig?:string};specialAttacks?:NamedAttack[];archivedSnapshot?:{specialAttacks?:NamedAttack[]}}
type MonsterLike = {name:string;imageUrl?:string;basicAttacks?:NamedAttack[];basicAttacksV2?:NamedAttack[];attributes?:{dex?:string;mig?:string}}
const safeName = (name:unknown, fallback:string) => typeof name==='string' && name.trim() ? name.trim().slice(0,68) : fallback
const weaponStyle=(name:string|undefined):ArenaPortrait['weaponStyle']=>!name?'fists':/cajado|bastão|varinha|staff|grim[oó]rio/i.test(name)?'staff':/arco|besta|bow|pistola|rifle/i.test(name)?'bow':/adaga|espada|lança|lâmina|machado|montante|sabre|knife/i.test(name)?'blade':'fists'
const die=(raw:unknown)=>{const value=Number(String(raw||'').replace('d',''));return Number.isFinite(value)?Math.max(4,Math.min(20,value)):8}
const safeDamage=(raw:unknown,fallback:number)=>{const amount=parseInt(String(raw),10);return Number.isFinite(amount)?Math.max(fallback-2,Math.min(fallback+5,amount)):fallback}
function attacksFor(source:NamedAttack[],attributes?:{dex?:string;mig?:string},weaponName?:string,isSpecialList=false):ArenaMove[]{
  const power= Math.floor((die(attributes?.mig)-8)/5)
  const light=isSpecialList?null:source[0]
  const heavy=isSpecialList?(source[1]||null):(source[1]||source[0])
  const special=source.find(a=>a.targetDefense==='magical')||source[0]
  return [
    {kind:'light',name:safeName(light?.name,'Golpe rápido'),damage:Math.max(5,7+power),range:84,magic:false,projectile:false},
    {kind:'heavy',name:safeName(heavy?.name,weaponName?`Ataque de ${weaponName}`:'Golpe pesado'),damage:Math.max(10,safeDamage(heavy?.damage,13)+power),range:109,magic:false,projectile:false},
    {kind:'special',name:safeName(special?.name,'Técnica suprema'),damage:Math.max(15,safeDamage(special?.damage,19)+power),range:156,
      magic:special?.targetDefense==='magical'||/mag|míst|arc|fire|ice/i.test(String(special?.type||'')),
      projectile:special?.targetDefense==='magical'||/mag|arcan|fire|ice/i.test(String(special?.type||''))},
  ]
}
export function portraitFromSheet(character:SheetLike,kind:'player'|'npc'):ArenaPortrait{
  const moves = character.specialAttacks || character.archivedSnapshot?.specialAttacks || []
  return {id:character.id,name:character.name,imageUrl:character.avatarUrl||'',ownerId:character.ownerId,kind,weaponStyle:weaponStyle(character.weaponName),
    moves:attacksFor(moves,character.attributes,character.weaponName,true),speed:Math.max(165,Math.min(225,190+(die(character.attributes?.dex)-8)*2.5)),
    power:die(character.attributes?.mig)}
}
export function portraitFromMonster(monster:MonsterLike,instanceId:string):ArenaPortrait{
  return {id:`monster:${instanceId}`,name:monster.name,imageUrl:monster.imageUrl||'',kind:'monster',weaponStyle:'fists',
    moves:attacksFor(monster.basicAttacksV2?.length?monster.basicAttacksV2:monster.basicAttacks||[],monster.attributes),
    speed:190,power:die(monster.attributes?.mig)}
}
