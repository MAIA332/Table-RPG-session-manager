import type {ArenaSnapshot} from './model'
/** Uma mensagem atrasada não desfaz pausa/retorno à seleção nem rebobina a luta. */
export function acceptArenaSnapshot(current:ArenaSnapshot|null,next:ArenaSnapshot|null){
 if(!next||!current||next.id!==current.id)return true
 const before=current.revision||0,after=next.revision||0
 if(after!==before)return after>before
 return next.tickAt>=current.tickAt
}
