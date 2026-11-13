import {notFound} from 'next/navigation'
import {getCurrentUser} from '@/lib/auth'
import {isArenaDeveloper} from '@/lib/arena/developer-access'
import {ArenaWorkshop} from '@/components/arena/arena-workshop'

export const dynamic='force-dynamic'
/** O HTML do editor sequer é entregue a usuários sem permissão. */
export default async function Page(){
 const user=await getCurrentUser()
 if(!isArenaDeveloper(user))notFound()
 return <ArenaWorkshop/>
}
