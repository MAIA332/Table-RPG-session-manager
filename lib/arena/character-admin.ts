import 'server-only'
import {store,saveToDisk,publish} from '@/lib/store'
import {getCurrentUser} from '@/lib/auth'
import {isArenaDeveloper} from './developer-access'
import type {CharacterRecord} from './character-schema'

/** Autorização do servidor: independente de campanha e de papel de mestre. */
export async function authorizedArenaEditor(request:Request,write=false){
 const user=await getCurrentUser()
 if(!user)throw new Error('Não autenticado.')
 if(!isArenaDeveloper(user))throw new Error('Acesso restrito ao desenvolvedor da Arena.')
 if(write){
  const origin=request.headers.get('origin')
  if(origin){
   const originUrl=new URL(origin),host=request.headers.get('host')
   if(originUrl.host!==host)throw new Error('Origem não autorizada.')
  }
 }
 return user
}
/** Usa o MongoDB existente; difunde atualização para todas as campanhas abertas. */
export async function saveCharacterRecord(key:string,record:CharacterRecord){
 const before=store.arenaCharacters.get(key)
 store.arenaCharacters.set(key,record)
 try{await saveToDisk(store)}catch(error){if(before)store.arenaCharacters.set(key,before);else store.arenaCharacters.delete(key);throw error}
 for(const campaignId of store.campaigns.keys())publish(campaignId,{type:'arena:changed'})
}
