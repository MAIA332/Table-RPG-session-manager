import {NO_INPUT,PULSE_BUTTONS,type ArenaFighter,type ArenaInput} from './model'
/** Edge counters survive reordering/retries and presses shorter than one network round trip. */
export function applyArenaInputPacket(f:ArenaFighter,value:unknown,pulses:unknown,seq:number,source:string,now:number,acceptActions=true){
 if(source&&source===f.lastInputSource&&seq<=f.lastInputSeq)return false
 const newSource=source!==f.lastInputSource
 if(newSource)f.lastPulseCounts={}
 f.lastInputSource=source;f.lastInputSeq=seq;f.lastAppliedInputSeq=seq
 const data=value&&typeof value==='object'?value as Record<string,unknown>:{}
 f.input=Object.fromEntries(Object.keys(NO_INPUT).map(key=>[key,data[key]===true])) as ArenaInput
 if(pulses&&typeof pulses==='object'){
  const counts=pulses as Record<string,unknown>
  for(const key of PULSE_BUTTONS){
   f.input[key]=false
   const count=counts[key]
   if(typeof count==='number'&&Number.isSafeInteger(count)&&count>=0){const fresh=count>(f.lastPulseCounts[key]||0);f.lastPulseCounts[key]=Math.max(count,f.lastPulseCounts[key]||0);if(newSource?data[key]===true&&count>0:fresh)f.pendingPulses[key]=true}
  }
 }
 if(!acceptActions){f.pendingPulses={};f.bufferKind=null;f.bufferUntil=0;f.previousButtons={...f.input};f.previousJump=f.input.jump;f.previousDodge=f.input.dodge;f.input={...NO_INPUT}}
 f.lastSeen=now;return true
}
