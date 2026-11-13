import type {ArenaSession} from './model'
export const SECRET_HOLD_MS=900
export const ALTER_LYSA_KEYS=['KeyQ','KeyE','KeyR'] as const
export const ALTER_LYSA_PAD=[4,5,3] as const // LB + RB + Y
export function hasAlterUnlock(room:ArenaSession,userId:string,device:string){return !!room.secretUnlocks?.some(g=>g.userId===userId&&g.device===device)}
export function revokeAlterUnlock(room:ArenaSession,userId?:string,device?:string){
 room.secretUnlocks=(room.secretUnlocks||[]).filter(g=>userId!==undefined&&(g.userId!==userId||device!==undefined&&g.device!==device))
 for(const f of room.fighters)if(userId===undefined||f.userId===userId&&(device===undefined||f.device===device)){
  f.alterLysa=false;f.euphoriaState='normal';f.euphoriaAt=0;f.euphoriaNeedsFull=false;f.danceUntil=0
 }
}
export function unlockAlterLysa(room:ArenaSession,userId:string,device:string){
 if(room.phase!=='lobby')throw new Error('O segredo só pode ser ativado na seleção de personagens.')
 const fighter=room.fighters.find(f=>f.userId===userId&&f.device===device&&!f.bot&&!f.withdrawn)
 if(!fighter||fighter.characterId!=='lysa')throw new Error('Selecione Lysa com este dispositivo antes de ativar o segredo.')
 if(!hasAlterUnlock(room,userId,device))(room.secretUnlocks||=[]).push({userId,device})
 fighter.alterLysa=true;fighter.lastSeen=Date.now();room.message='ALTER LYSA · A HERDEIRA DO VAZIO'
}
