import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getMemberRole, store } from '@/lib/store'
import { arenaSnapshot, commandArena, type ArenaCommand } from '@/lib/arena/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = {'Cache-Control': 'private, no-store'}
async function access(params: Promise<{id:string}>) {
  const user = await getCurrentUser()
  if (!user) return {error: NextResponse.json({error:'Não autenticado.'},{status:401})}
  const {id} = await params
  const campaign = store.campaigns.get(id)
  const role = campaign && getMemberRole(campaign, user.id)
  if (!campaign || !role) return {error: NextResponse.json({error:'Sem acesso à campanha.'},{status:403})}
  return {id, user, role}
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const auth = await access(params)
  if (auth.error) return auth.error
  const snapshot=arenaSnapshot(auth.id!)
  const compact=new URL(request.url).searchParams.get('compact')==='1'
  // 10 Hz de snapshots sem retransmitir a cada quadro imagens base64 das fichas.
  return NextResponse.json({room: snapshot && compact ? {...snapshot,roster:undefined} : snapshot, compact}, {headers})
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const auth = await access(params)
  if (auth.error) return auth.error
  const cmd = await request.json().catch(() => null)
  if (!cmd || typeof cmd !== 'object' || typeof cmd.action !== 'string' ||
      !['open','join','select','start','rematch','reset','close','leave','kick','input','heartbeat','pause','resume','exit','forfeit'].includes(cmd.action))
    return NextResponse.json({error:'Comando inválido.'},{status:400})
  try {
    const room=commandArena(auth.id!, auth.user!.id, auth.role === 'gm', cmd as ArenaCommand)
    if (cmd.action==='input'||cmd.action==='heartbeat') return NextResponse.json({ok:true},{headers})
    return NextResponse.json({room},{headers})
  } catch (cause) {
    return NextResponse.json({error: cause instanceof Error ? cause.message : 'Comando não processado.'},{status:409,headers})
  }
}
