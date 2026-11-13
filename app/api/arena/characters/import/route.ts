import {NextResponse} from 'next/server'
import {store} from '@/lib/store'
import {authorizedArenaEditor,saveCharacterRecord} from '@/lib/arena/character-admin'
import {globalCharacterKey,globalCharacterRecords,ARENA_GLOBAL_SCOPE} from '@/lib/arena/character-registry'
import {validateCharacterDefinition,type CharacterRecord} from '@/lib/arena/character-schema'
import {validateAssets,writeContentAssets,resolvedDefinition,type IncomingAsset} from '@/lib/arena/asset-storage'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function POST(req:Request){
 let author:Awaited<ReturnType<typeof authorizedArenaEditor>>
 try{author=await authorizedArenaEditor(req,true)}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Acesso negado'},{status:403})}
 try{
  const length=Number(req.headers.get('content-length')||0)
  if(length>125*1024*1024)throw new Error('Upload acima de 125 MiB.')
  const form=await req.formData()
  const raw=String(form.get('manifest')||'')
  if(raw.length>150_000)throw new Error('Manifest excede 150 KB.')
  const definition=validateCharacterDefinition(JSON.parse(raw))
  const action=form.get('action')==='draft'?'draft':'publish'
  const files:IncomingAsset[]=[],entries=form.getAll('files'),paths=form.getAll('paths')
  if(entries.length>160||entries.length!==paths.length)throw new Error('Quantidade de arquivos/caminhos inválida.')
  let total=0
  for(let i=0;i<entries.length;i++){
   const entry=entries[i],name=paths[i]
   if(typeof name!=='string')throw new Error('Caminho inválido.')
   if(!(entry instanceof File))throw new Error('Arquivo inválido.')
   total+=entry.size
   if(total>120*1024*1024)throw new Error('Pasta acima de 120 MiB.')
   if(entry.size>24*1024*1024)throw new Error('Arquivo grande demais: '+name)
   files.push({name,data:Buffer.from(await entry.arrayBuffer()),extension:name.split('.').at(-1)?.toLowerCase()||''})
  }
  validateAssets(files)
  const key=globalCharacterKey(definition.id),prior=store.arenaCharacters.get(key)||globalCharacterRecords(store.arenaCharacters).find(r=>r.id===definition.id)
  if(prior&&prior.revisions.length>=60)throw new Error('Limite de 60 revisões: arquive ou exporte antes de continuar.')
  // Primeiro garantir bytes imutáveis; só então comitar revisão e ponteiro no MongoDB.
  const assets=await writeContentAssets(files)
  const resolved=resolvedDefinition(definition,assets)
  const revision=(prior?.revisions.at(-1)?.revision||0)+1
  resolved.revision=revision
  const now=Date.now(),record:CharacterRecord={id:resolved.id,campaignId:ARENA_GLOBAL_SCOPE,updatedAt:now,publishedRevision:action==='publish'?revision:prior?.publishedRevision??null,
   revisions:[...(prior?.revisions||[]),{revision,definition:resolved,createdAt:now,authorId:author.id,state:action==='publish'?'published':'draft'}]}
  await saveCharacterRecord(key,record)
  return NextResponse.json({ok:true,id:resolved.id,revision,publishedRevision:record.publishedRevision,definition:resolved})
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Falha no importador.'},{status:400})}
}
