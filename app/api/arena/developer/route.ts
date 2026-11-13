import {NextResponse} from 'next/server'
import {getCurrentUser} from '@/lib/auth'
import {isArenaDeveloper} from '@/lib/arena/developer-access'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(){
 const user=await getCurrentUser()
 return NextResponse.json({developer:isArenaDeveloper(user)},{headers:{'Cache-Control':'private, no-store'}})
}
