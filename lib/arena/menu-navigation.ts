/** Navegação espacial do gamepad: inclui cabeçalho, retratos, jogadores e comandos inferiores. */
export type ArenaMenuZone='top'|'roster'|'stages'|'seats'|'join'|'launch'
export type ArenaMenuFocus={zone:ArenaMenuZone;index:number}
export type ArenaMenuShape={rosterCount:number;columns:number;joinCount:number;canLaunch:boolean;topCount:number}
const cap=(n:number,max:number)=>Math.max(0,Math.min(Math.max(0,max-1),n))
export function navigateArenaMenu(focus:ArenaMenuFocus,direction:number,shape:ArenaMenuShape):ArenaMenuFocus {
 const {zone,index}=focus
 const cols=Math.max(1,shape.columns),count=Math.max(0,shape.rosterCount)
 const delta=Math.sign(direction),vertical=Math.abs(direction)===2
 if(!delta)return focus
 if(!vertical){
  const countHere=zone==='top'?shape.topCount:zone==='roster'?count:zone==='stages'||zone==='seats'?4:zone==='join'?shape.joinCount:1
  return {zone,index:cap(index+delta,countHere)}
 }
 if(zone==='top')return delta>0?{zone:'roster',index:cap(index,count)}:focus
 if(zone==='roster'){
  if(delta<0&&index<cols)return {zone:'top',index:cap(index,shape.topCount)}
  const target=index+delta*cols
  if(delta>0&&target>=count)return {zone:'stages',index:cap(index%cols,4)}
  return {zone,index:cap(target,count)}
 }
 if(zone==='stages')return delta<0?{zone:'roster',index:cap(Math.floor(Math.max(0,count-1)/cols)*cols+index,count)}:{zone:'seats',index:cap(index,4)}
 if(zone==='seats')return delta<0?{zone:'stages',index:cap(index,4)}:{zone:'join',index:cap(index,shape.joinCount)}
 if(zone==='join')return delta<0?{zone:'seats',index:cap(index,4)}:shape.canLaunch?{zone:'launch',index:0}:focus
 if(zone==='launch'&&delta<0)return {zone:'join',index:cap(index,shape.joinCount)}
 return focus
}
