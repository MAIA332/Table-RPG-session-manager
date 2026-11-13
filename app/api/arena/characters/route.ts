import {NextResponse} from 'next/server'
import {store} from '@/lib/store'
import {authorizedArenaEditor} from '@/lib/arena/character-admin'
import {globalCharacterRecords} from '@/lib/arena/character-registry'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(req:Request){
 try{
  await authorizedArenaEditor(req)
  return NextResponse.json({characters:globalCharacterRecords(store.arenaCharacters)},{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Acesso negado'},{status:403})}
}
