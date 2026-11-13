/** Contrato compartilhado entre editor, importador, API e simulação. Sem dependências externas. */
export const ARENA_CHARACTER_SCHEMA = 1 as const
export const CHARACTER_ACTIONS = ['idle','forward','backward','jump','crouch','guard','hit','fall','rise','light','heavy','kick','lowKick','special0','special1','special2'] as const
export type CharacterAction = typeof CHARACTER_ACTIONS[number]
export type BasicMove = 'light'|'heavy'|'kick'|'lowKick'|'special'
export type CharacterBox = {x:number;y:number;w:number;h:number}
export type HitboxWindow = CharacterBox & {fromFrame:number;toFrame:number}
export type AnimationDefinition = {
 atlas:string; columns:number; rows:number; frames:number; fps:number; loop:boolean
 row?:number; startFrame?:number; cellWidth?:number; cellHeight?:number
 anchorX?:number;anchorY?:number;frameDurations?:number[]
}
export type MoveDefinition = {
 startupFrames:number;activeFrames:number;recoveryFrames:number;damage:number;range:number
 hitboxes?:HitboxWindow[];bufferFrames?:number;cancelStartFrame?:number
 cancelOnHit?:BasicMove[];cancelOnBlock?:BasicMove[];cancelOnWhiff?:BasicMove[]
 hitstopFrames?:number
}
/** Ações deliberadamente restritas: um manifest nunca executa JavaScript. */
export type AbilityDefinition = {
 name:string;description?:string;action:'projectile'|'buff'|'dash'|'direct'|'zone'|'none';
 damage?:number;range?:number;speed?:number;duration?:number;cost?:number
 projectileStyle?:'fire'|'ice'|'blood'|'bullet'|'shadow'|'gravity'|'chain'|'root'
 zoneKind?:'gravity'|'darkness'|'blizzard'|'roots'|'barrier'|'cage'|'fate'
}
export type ArenaCharacterDefinition = {
 schemaVersion:1; id:string;name:string;title?:string;color?:string;revision:number
 portrait:string;speed:number;power:number
 rig:{cellWidth:number;cellHeight:number;anchorX:number;anchorY:number;bodyHeight:number;bodyWidth:number}
 animations:Partial<Record<CharacterAction,AnimationDefinition>>
 moves:Partial<Record<BasicMove,MoveDefinition>>;abilities:AbilityDefinition[]
 ai?:{style:'balanced'|'rushdown'|'zoner'|'grappler';difficulty?:'easy'|'normal'|'hard'}
}
export type CharacterRevision = {revision:number;definition:ArenaCharacterDefinition;state:'draft'|'published'|'archived';createdAt:number;authorId:string}
export type CharacterRecord = {id:string;campaignId:string;publishedRevision:number|null;revisions:CharacterRevision[];updatedAt:number}
export const DEFAULT_MOVES:Record<BasicMove,MoveDefinition>={
 light:{startupFrames:7,activeFrames:8,recoveryFrames:5,damage:6,range:118,bufferFrames:6},
 heavy:{startupFrames:8,activeFrames:8,recoveryFrames:6,damage:8,range:110,bufferFrames:6},
 kick:{startupFrames:11,activeFrames:8,recoveryFrames:6,damage:11,range:152,bufferFrames:6},
 lowKick:{startupFrames:10,activeFrames:8,recoveryFrames:5,damage:9,range:138,bufferFrames:6},
 special:{startupFrames:17,activeFrames:8,recoveryFrames:15,damage:16,range:180,bufferFrames:8},
}
const isObj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const fail:(what:string)=>never=(what)=>{throw new Error('Personagem inválido: '+what)}
const str=(v:unknown,path:string,max=120):string=>typeof v==='string'&&v.trim().length>0&&v.length<=max?v.trim():fail(path)
const number=(v:unknown,path:string,min:number,max:number):number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:fail(path)
const integer=(v:unknown,path:string,min:number,max:number)=>{const n=number(v,path,min,max);return Number.isInteger(n)?n:fail(path)}
const optionalNumber=(v:unknown,path:string,min:number,max:number):number|undefined=>v===undefined?undefined:number(v,path,min,max)
export function safeAssetPath(value:string):boolean {
 return value.length<250&&!value.startsWith('/')&&!value.includes('\\')&&!value.includes('..')&&!value.split('/').some(p=>!p||p==='.')&&/^[a-zA-Z0-9_./-]+$/.test(value)&&/\.(png|webp|ogg)$/i.test(value)
}
export const isPublishedAssetUrl=(v:string)=>/^\/api\/arena\/assets\/[a-f0-9]{64}\.(png|webp|ogg)$/.test(v)
function asset(v:unknown,path:string){const x=str(v,path,250);if(!safeAssetPath(x)&&!isPublishedAssetUrl(x))fail(path+' deve apontar para um asset local');return x}
function box(v:unknown,path:string):CharacterBox {
 if(!isObj(v))fail(path)
 return {x:number(v.x,path+'.x',-2000,2000),y:number(v.y,path+'.y',-2000,2000),w:number(v.w,path+'.w',1,2000),h:number(v.h,path+'.h',1,2000)}
}
export function validateCharacterDefinition(raw:unknown):ArenaCharacterDefinition {
 if(!isObj(raw))fail('character.json deve conter um objeto')
 if(raw.schemaVersion!==1)fail('schemaVersion deve ser 1')
 const id=str(raw.id,'id',48).toLowerCase()
 if(!/^[a-z0-9][a-z0-9-]{1,47}$/.test(id))fail('id: use letras minúsculas, números e hífen')
 const rig=isObj(raw.rig)?raw.rig:fail('rig')
 const out:ArenaCharacterDefinition={schemaVersion:1,id,name:str(raw.name,'name'),revision:integer(raw.revision??1,'revision',1,100000),
  portrait:asset(raw.portrait,'portrait'),speed:number(raw.speed??225,'speed',90,450),power:number(raw.power??10,'power',1,100),
  rig:{cellWidth:integer(rig.cellWidth,'rig.cellWidth',32,2048),cellHeight:integer(rig.cellHeight,'rig.cellHeight',32,2048),anchorX:number(rig.anchorX,'rig.anchorX',0,2048),anchorY:number(rig.anchorY,'rig.anchorY',0,2048),bodyHeight:number(rig.bodyHeight??184,'rig.bodyHeight',30,450),bodyWidth:number(rig.bodyWidth??56,'rig.bodyWidth',15,250)},
  animations:{},moves:{},abilities:[]}
 if(raw.title!==undefined)out.title=str(raw.title,'title')
 if(raw.color!==undefined){const color=str(raw.color,'color',9);if(!/^#[0-9a-fA-F]{6}$/.test(color))fail('color');out.color=color}
 if(!isObj(raw.animations))fail('animations')
 for(const [action,entry] of Object.entries(raw.animations)){
  if(!CHARACTER_ACTIONS.includes(action as CharacterAction)||!isObj(entry))fail('animations.'+action)
  const rows=integer(entry.rows??1,action+'.rows',1,128),columns=integer(entry.columns??6,action+'.columns',1,32)
  const frames=integer(entry.frames,action+'.frames',1,2048),row=integer(entry.row??0,action+'.row',0,rows-1),startFrame=integer(entry.startFrame??row*columns,action+'.startFrame',0,rows*columns-1)
  if(startFrame+frames>rows*columns)fail(action+': frames fora do atlas')
  const item:AnimationDefinition={atlas:asset(entry.atlas,action+'.atlas'),columns,rows,frames,
   fps:number(entry.fps??12,action+'.fps',1,60),loop:entry.loop===undefined?['idle','forward','backward'].includes(action):entry.loop===true,row,startFrame,
   cellWidth:optionalNumber(entry.cellWidth,action+'.cellWidth',32,2048),cellHeight:optionalNumber(entry.cellHeight,action+'.cellHeight',32,2048),
   anchorX:optionalNumber(entry.anchorX,action+'.anchorX',0,2048),anchorY:optionalNumber(entry.anchorY,action+'.anchorY',0,2048)}
  if(entry.frameDurations!==undefined){if(!Array.isArray(entry.frameDurations)||entry.frameDurations.length!==frames)fail(action+'.frameDurations');item.frameDurations=entry.frameDurations.map((n,i)=>integer(n,action+'.frameDurations['+i+']',1,120))}
  out.animations[action as CharacterAction]=item
 }
 if(!out.animations.idle)fail('animations.idle é obrigatória')
 if(raw.moves!==undefined&&!isObj(raw.moves))fail('moves')
 for(const [kind,m] of Object.entries((raw.moves||{}) as Record<string,unknown>)){
  if(!Object.hasOwn(DEFAULT_MOVES,kind)||!isObj(m))fail('moves.'+kind)
  const base=DEFAULT_MOVES[kind as BasicMove]
  const move:MoveDefinition={startupFrames:integer(m.startupFrames??base.startupFrames,kind+'.startupFrames',1,180),activeFrames:integer(m.activeFrames??base.activeFrames,kind+'.activeFrames',1,180),recoveryFrames:integer(m.recoveryFrames??base.recoveryFrames,kind+'.recoveryFrames',1,180),damage:integer(m.damage??base.damage,kind+'.damage',0,100),range:integer(m.range??base.range,kind+'.range',20,600)}
  move.bufferFrames=integer(m.bufferFrames??6,kind+'.bufferFrames',1,30)
  move.hitstopFrames=integer(m.hitstopFrames??2,kind+'.hitstopFrames',0,12)
  if(m.cancelStartFrame!==undefined)move.cancelStartFrame=integer(m.cancelStartFrame,kind+'.cancelStartFrame',1,move.startupFrames+move.activeFrames+move.recoveryFrames)
  for(const key of ['cancelOnHit','cancelOnBlock','cancelOnWhiff'] as const)if(m[key]!==undefined){if(!Array.isArray(m[key])||m[key].length>5||!m[key].every((v:unknown)=>typeof v==='string'&&Object.hasOwn(DEFAULT_MOVES,v)))fail(kind+'.'+key);move[key]=[...new Set(m[key] as BasicMove[])]}
  if(m.hitboxes!==undefined){if(!Array.isArray(m.hitboxes)||m.hitboxes.length>32)fail(kind+'.hitboxes');move.hitboxes=m.hitboxes.map((v:unknown,i:number)=>{const p=kind+'.hitboxes['+i+']';if(!isObj(v))fail(p);const rectangle=box(v,p),fromFrame=integer(v.fromFrame,p+'.fromFrame',1,move.startupFrames+move.activeFrames),toFrame=integer(v.toFrame,p+'.toFrame',fromFrame,move.startupFrames+move.activeFrames);return {...rectangle,fromFrame,toFrame}})}
  out.moves[kind as BasicMove]=move
 }
 if(raw.abilities!==undefined){if(!Array.isArray(raw.abilities)||raw.abilities.length>3)fail('abilities');out.abilities=raw.abilities.map((v:unknown,i:number)=>{
  const p='abilities['+i+']';if(!isObj(v)||!['projectile','buff','dash','direct','zone','none'].includes(String(v.action)))fail(p)
  const a:AbilityDefinition={name:str(v.name,p+'.name'),action:v.action as AbilityDefinition['action']}
  if(v.description!==undefined)a.description=str(v.description,p+'.description',450)
  for(const [key,min,max] of [['damage',0,100],['range',10,600],['speed',20,1400],['duration',.1,12],['cost',0,100]] as const)if(v[key]!==undefined)(a as unknown as Record<string,unknown>)[key]=number(v[key],p+'.'+key,min,max)
  if(v.projectileStyle!==undefined){if(!['fire','ice','blood','bullet','shadow','gravity','chain','root'].includes(String(v.projectileStyle)))fail(p+'.projectileStyle');a.projectileStyle=v.projectileStyle as AbilityDefinition['projectileStyle']}
  if(v.zoneKind!==undefined){if(!['gravity','darkness','blizzard','roots','barrier','cage','fate'].includes(String(v.zoneKind)))fail(p+'.zoneKind');a.zoneKind=v.zoneKind as AbilityDefinition['zoneKind']}
  return a
 })}
 if(raw.ai!==undefined){if(!isObj(raw.ai)||!['balanced','rushdown','zoner','grappler'].includes(String(raw.ai.style)))fail('ai');out.ai={style:raw.ai.style as NonNullable<ArenaCharacterDefinition['ai']>['style']};if(raw.ai.difficulty!==undefined){if(!['easy','normal','hard'].includes(String(raw.ai.difficulty)))fail('ai.difficulty');out.ai.difficulty=raw.ai.difficulty as 'easy'|'normal'|'hard'}}
 return out
}
