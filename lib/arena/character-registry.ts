import type {ArenaPortrait} from './model'
import {ARENA_CAST} from './catalog'
import {DEFAULT_MOVES,type ArenaCharacterDefinition,type CharacterRecord,type BasicMove} from './character-schema'

export const ARENA_GLOBAL_SCOPE='global'
export const globalCharacterKey=(id:string)=>ARENA_GLOBAL_SCOPE+':'+id

/** Adaptador que mantém as doze fichas e especiais legados intactos. */
export function characterPortrait(definition:ArenaCharacterDefinition):ArenaPortrait{
 const d=definition
 return {id:d.id,name:d.name,title:d.title||'Novo lutador',imageUrl:d.portrait,kind:'player',color:d.color||'#93bcf0',speed:d.speed,power:d.power,weaponStyle:'fists',definition:d,
  techniques:d.abilities.map(a=>({name:a.name,description:a.description||a.action})),
  moves:(['light','heavy','kick','lowKick','special'] as BasicMove[]).map(kind=>{
   const m={...DEFAULT_MOVES[kind],...d.moves[kind]}
   return {kind,name:kind==='special'?d.abilities[0]?.name||'Especial':({light:'Soco alto',heavy:'Soco baixo',kick:'Chute alto',lowKick:'Chute baixo'} as Record<string,string>)[kind],damage:m.damage,range:m.range,magic:kind==='special',projectile:false}
  })}
}

/**
 * Todas as campanhas consultam o mesmo catálogo.
 * Compatibilidade não destrutiva: revisões antigas por campanha são expostas
 * globalmente como legado, usando a publicada mais recente para cada ID.
 * Uma publicação pelo desenvolvedor cria a cópia global, que ganha precedência
 * (inclusive quando arquivada); não altera os documentos antigos.
 */
export function globalCharacterRecords(records:ReadonlyMap<string,CharacterRecord>):CharacterRecord[]{
 const resolved=new Map<string,CharacterRecord>()
 const old=[...records.values()].filter(r=>r.campaignId!==ARENA_GLOBAL_SCOPE)
 old.sort((a,b)=>Number(b.publishedRevision!==null)-Number(a.publishedRevision!==null)||b.updatedAt-a.updatedAt||a.id.localeCompare(b.id))
 for(const rec of old)if(!resolved.has(rec.id))resolved.set(rec.id,{...rec,campaignId:ARENA_GLOBAL_SCOPE})
 for(const rec of records.values())if(rec.campaignId===ARENA_GLOBAL_SCOPE)resolved.set(rec.id,rec)
 return [...resolved.values()].sort((a,b)=>a.id.localeCompare(b.id))
}
export function publishedCharacters(_campaignId:string,records:ReadonlyMap<string,CharacterRecord>):ArenaPortrait[]{
 const result=new Map(ARENA_CAST.map(p=>[p.id,{...p}] as const))
 for(const record of globalCharacterRecords(records)){
  if(record.publishedRevision===null)continue
  const revision=record.revisions.find(x=>x.revision===record.publishedRevision)
  if(revision)result.set(record.id,characterPortrait(revision.definition))
 }
 return [...result.values()]
}
