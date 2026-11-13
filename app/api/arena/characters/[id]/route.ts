import {NextResponse} from 'next/server'
import {store} from '@/lib/store'
import {authorizedArenaEditor,saveCharacterRecord} from '@/lib/arena/character-admin'
import {globalCharacterKey,globalCharacterRecords,ARENA_GLOBAL_SCOPE} from '@/lib/arena/character-registry'
export const runtime='nodejs'
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{await authorizedArenaEditor(req,true)}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Acesso negado'},{status:403})}
 try{
  const {id}=await params,body=await req.json()
  const key=globalCharacterKey(id),record=store.arenaCharacters.get(key)||globalCharacterRecords(store.arenaCharacters).find(r=>r.id===id)
  if(!record)throw new Error('Personagem não encontrado.')
  if(!['rollback','archive','publish'].includes(body?.action))throw new Error('Ação inválida.')
  const revision=body.action==='archive'?null:Number(body.revision)
  if(revision!==null&&(!Number.isSafeInteger(revision)||!record.revisions.some(r=>r.revision===revision)))throw new Error('Revisão não existe.')
  const updated={...record,campaignId:ARENA_GLOBAL_SCOPE,updatedAt:Date.now(),publishedRevision:revision}
  await saveCharacterRecord(key,updated)
  return NextResponse.json({ok:true,publishedRevision:revision})
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha.'},{status:400})}
}
