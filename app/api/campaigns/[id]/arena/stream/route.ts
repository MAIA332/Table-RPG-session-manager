import { getCurrentUser } from '@/lib/auth'
import { getMemberRole, store } from '@/lib/store'
import { arenaSnapshot } from '@/lib/arena/server'

export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await getCurrentUser(),{id}=await params,campaign=store.campaigns.get(id)
 if(!user||!campaign||!getMemberRole(campaign,user.id))return new Response('Sem acesso.',{status:403})
 const encoder=new TextEncoder()
 let timer:ReturnType<typeof setInterval>|undefined,stop=()=>{}
 const stream=new ReadableStream({
  start(controller){
   let closed=false,lastSent=0
   stop=()=>{if(closed)return;closed=true;if(timer)clearInterval(timer);request.signal.removeEventListener('abort',stop);try{controller.close()}catch{}}
   const send=()=>{
    if(closed)return
    // Não acumula snapshots se o navegador ou a rede estiverem congestionados.
    if((controller.desiredSize??1)<=0)return
    const room=arenaSnapshot(id),now=Date.now()
    if(room?.phase!=='playing'&&now-lastSent<350)return
    lastSent=now
    try{controller.enqueue(encoder.encode(`data: ${JSON.stringify({room:room?{...room,roster:undefined}:null,at:now})}\n\n`))}catch{stop()}
   }
   timer=setInterval(send,33);request.signal.addEventListener('abort',stop,{once:true})
   if(request.signal.aborted)stop();else send()
  },cancel(){stop()},
 })
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'private, no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'}})
}
