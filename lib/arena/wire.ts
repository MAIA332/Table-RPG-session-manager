import type {ArenaSnapshot,ArenaPublicFighter} from './model'
type Patch=Partial<Omit<ArenaSnapshot,'fighters'>> & {fighters:(Partial<ArenaPublicFighter>&{id:string})[]}
type WireRoom=Omit<ArenaSnapshot,'roster'>&{roster?:ArenaSnapshot['roster']}
export type ArenaWireFrame={room?:WireRoom|null;delta?:Patch;key?:string;seq?:number;at:number}
/** Deltas refer to a fixed keyframe, never to the previous packet: a skipped or reordered
 * message cannot corrupt the next snapshot. New connections always begin with full state. */
export class ArenaWireEncoder{
 private base:WireRoom|null=null
 private baseAt=0
 private key=''
 private stream=Date.now().toString(36)+Math.random().toString(36).slice(2)
 private seq=0
 encode(room:WireRoom|null,at:number):ArenaWireFrame{
  const seq=++this.seq
  if(!room||!this.base||at-this.baseAt>=2000||room.phase!=='playing'||room.id!==this.base.id||room.phase!==this.base.phase||room.rounds!==this.base.rounds||room.roundStatus!==this.base.roundStatus){this.base=room?JSON.parse(JSON.stringify(room)):null;this.baseAt=at;this.key=this.stream+':'+seq;return{room:this.base,key:this.key,seq,at}}
  const delta:Record<string,unknown>={}
  for(const key of Object.keys(room) as (keyof ArenaSnapshot)[])if(key!=='fighters'&&key!=='roster'){
   const value=room[key],before=this.base[key]
   if(typeof value==='object'?JSON.stringify(value)!==JSON.stringify(before):value!==before)delta[key]=value
  }
  delta.fighters=room.fighters.map(f=>{const base=this.base!.fighters.find(b=>b.id===f.id),patch:Record<string,unknown>={id:f.id};for(const key of Object.keys(f) as (keyof ArenaPublicFighter)[])if(!base||f[key]!==base[key])patch[key]=f[key];return patch})
  return{delta:delta as Patch,key:this.key,seq,at}
 }
}
export class ArenaWireDecoder{
 private bases=new Map<string,WireRoom>()
 private pending=new Map<string,ArenaWireFrame>()
 read(frame:ArenaWireFrame):WireRoom|null|undefined{
  if(frame.room!==undefined){
   if(frame.room&&frame.key!==undefined){
    this.bases.set(frame.key,frame.room)
    while(this.bases.size>3)this.bases.delete(this.bases.keys().next().value!)
    const pending=this.pending.get(frame.key);this.pending.delete(frame.key)
    if(pending&&(pending.seq||0)>(frame.seq||0))return this.read(pending)
   }
   return frame.room
  }
  if(!frame.delta||frame.key===undefined)return undefined
  const base=this.bases.get(frame.key)
  if(!base){const prior=this.pending.get(frame.key);if(!prior||(frame.seq||0)>(prior.seq||0))this.pending.set(frame.key,frame);while(this.pending.size>3)this.pending.delete(this.pending.keys().next().value!);return undefined}
  return{...base,...frame.delta,fighters:frame.delta.fighters.map(patch=>({...base.fighters.find(f=>f.id===patch.id),...patch}) as ArenaPublicFighter)}
 }
}
