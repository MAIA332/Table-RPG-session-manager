import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { store, getMemberRole, publish, transactStore } from '@/lib/store'
import type { ActivePoll } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const jsonHeaders = { 'Cache-Control': 'private, no-store' }

async function access(params: Promise<{id:string}>) {
  const user = await getCurrentUser()
  if (!user) return { error: NextResponse.json({error:'Não autenticado.'},{status:401}) }
  const { id } = await params
  const campaign = store.campaigns.get(id)
  const role = campaign && getMemberRole(campaign,user.id)
  if (!campaign || !role) return {error:NextResponse.json({error:'Sem acesso à campanha.'},{status:403})}
  return {id,user,role}
}
function pollOf(value: unknown): ActivePoll | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const poll = value as ActivePoll
  if (typeof poll.id !== 'string' || !/^[a-z0-9_-]{1,100}$/i.test(poll.id) ||
    typeof poll.question !== 'string' || !poll.question.trim() || poll.question.length > 300 ||
    !Array.isArray(poll.options) || poll.options.length < 2 || poll.options.length > 12 ||
    poll.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 160) ||
    !Number.isSafeInteger(poll.expiresAt) ||
    !poll.votes || typeof poll.votes !== 'object' || Array.isArray(poll.votes)) return null
  return poll
}
export async function GET(_request: Request, {params}: {params:Promise<{id:string}>}) {
  const result = await access(params)
  if (result.error) return result.error
  const current = pollOf(store.campaignState.get(result.id!)?.activePoll)
  return NextResponse.json({activePoll:current && current.expiresAt > Date.now() ? current : null},{headers:jsonHeaders})
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const result = await access(params)
  if (result.error) return result.error
  const body = await request.json().catch(()=>null)
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return NextResponse.json({error:'Solicitação inválida.'},{status:400})
  if (body.action === 'start') {
    if (result.role !== 'gm') return NextResponse.json({error:'Somente o mestre lança enquetes.'},{status:403})
    const incoming = pollOf(body.poll)
    const now = Date.now()
    if (!incoming || incoming.expiresAt <= now || incoming.expiresAt > now + 3_600_000)
      return NextResponse.json({error:'Pergunta, opções ou duração inválidas.'},{status:400})
    const poll:ActivePoll = {...incoming,question:incoming.question.trim(), options:incoming.options.map(o=>o.trim()),votes:{}}
    await transactStore(db=>{
      const current = db.campaignState.get(result.id!) || {}
      db.campaignState.set(result.id!, {...current,activePoll:poll})
      return {value:null,changed:true}
    })
    publish(result.id!,{type:'poll:start',poll})
    return NextResponse.json({success:true,activePoll:poll},{headers:jsonHeaders})
  }
  if (body.action === 'vote') {
    if (typeof body.pollId !== 'string' || !Number.isInteger(body.optionIndex))
      return NextResponse.json({error:'Voto inválido.'},{status:400})
    try {
      const poll = await transactStore(db=>{
        const state = db.campaignState.get(result.id!) || {}
        const current = pollOf(state.activePoll)
        if (!current || current.id !== body.pollId || current.expiresAt <= Date.now()) throw new Error('Enquete encerrada ou indisponível.')
        if (body.optionIndex < 0 || body.optionIndex >= current.options.length) throw new Error('Opção inválida.')
        const next = {...current,votes:{...current.votes,[result.user!.id]:body.optionIndex}}
        db.campaignState.set(result.id!,{...state,activePoll:next})
        return {value:next,changed:true}
      })
      // O usuário é derivado da sessão; nunca aceitar userId arbitrário do cliente.
      publish(result.id!,{type:'poll:vote',pollId:poll.id,userId:result.user!.id,optionIndex:body.optionIndex})
      return NextResponse.json({success:true,activePoll:poll},{headers:jsonHeaders})
    } catch (error) {
      return NextResponse.json({error:error instanceof Error?error.message:'Voto não registrado.'},{status:409})
    }
  }
  return NextResponse.json({error:'Ação desconhecida.'},{status:400})
}
