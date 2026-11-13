import type {User} from '@/lib/types'

/** Permissão global e explícita: ser mestre NÃO concede acesso ao Estúdio.
 * Sem configuração, nenhum usuário pode editar o catálogo de personagens.
 * IDs são preferíveis a e-mails caso os usuários possam alterar o endereço.
 */
export function isArenaDeveloper(
 user:Pick<User,'id'|'email'>|null|undefined,
 config:{emails?:string;userIds?:string}={emails:process.env.ARENA_DEVELOPER_EMAILS,userIds:process.env.ARENA_DEVELOPER_USER_IDS},
):boolean{
 if(!user)return false
 const entries=(v:string|undefined)=>new Set((v||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))
 return entries(config.userIds).has(user.id.toLowerCase()) || entries(config.emails).has(user.email.trim().toLowerCase())
}
