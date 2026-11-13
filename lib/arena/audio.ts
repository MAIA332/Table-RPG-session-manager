/** Samples de bibliotecas locais, sem osciladores ou síntese de áudio em tempo real. */
import {ARENA_WIDTH} from './model'
type Layer={url:string;gain?:number;delay?:number}
type Clip=Layer&{layers?:Layer[];maxDuration?:number}
type Manifest={cues:Record<string,Clip>;sources:unknown[]}
class ArenaAudio {
 private context:AudioContext|null=null
 private manifest:Manifest|null=null
 private manifestPromise:Promise<Manifest>|null=null
 private buffers=new Map<string,Promise<AudioBuffer>>()
 private voices=new Set<AudioBufferSourceNode>()
 private enabled=true
 private events=0
 private uiAt=new Map<string,number>()
 private master:GainNode|null=null
 private music:HTMLAudioElement|null=null
 private musicSource:MediaElementAudioSourceNode|null=null
 private musicGain:GainNode|null=null
 private musicWanted:'menu'|'battle'|null=null
 private musicLoaded:'menu'|'battle'|null=null
 private musicPaused=false
 setEnabled(enabled:boolean){this.enabled=enabled;if(!enabled){for(const voice of this.voices)try{voice.stop()}catch{}this.voices.clear()}this.syncMusic()}
 setMusic(mode:'menu'|'battle'|null,paused=false){
  this.musicWanted=mode;this.musicPaused=paused
  if(!mode&&this.music){this.music.pause();this.music.currentTime=0}
  if(mode)void this.unlock();else this.syncMusic()
 }
 private syncMusic(){
  if(typeof window==='undefined')return
  if(!this.musicWanted||!this.enabled){this.music?.pause();return}
  if(!this.context||!this.master)return
  const src='/arena/audio/'+(this.musicWanted==='battle'?'tema-arena-2':'tema-arena')+'.mp3'
  if(!this.music){this.music=new Audio(src);this.music.loop=true;this.music.preload='auto';this.music.dataset.arenaTheme='true';this.musicLoaded=this.musicWanted}
  if(this.musicLoaded!==this.musicWanted){this.music.pause();this.music.src=src;this.music.currentTime=0;this.musicLoaded=this.musicWanted}
  if(!this.musicSource){this.musicSource=this.context.createMediaElementSource(this.music);this.musicGain=this.context.createGain();this.musicGain.gain.value=this.musicPaused?.035:.12;this.musicSource.connect(this.musicGain);this.musicGain.connect(this.master)}
  this.musicGain!.gain.setTargetAtTime(this.musicPaused?.035:.12,this.context.currentTime,.12)
  if(this.context.state==='running'&&this.music.paused)void this.music.play().catch(()=>{/* A próxima interação libera a reprodução. */})
 }
 async unlock(){
  if(typeof window==='undefined')return
  if(!this.context){this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=.72;const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-14;compressor.ratio.value=4;compressor.attack.value=.004;compressor.release.value=.18;this.master.connect(compressor);compressor.connect(this.context.destination)}
  if(this.context.state==='suspended')await this.context.resume().catch(()=>{})
  this.syncMusic()
 }
 async load(){
  if(!this.manifestPromise)this.manifestPromise=fetch('/arena/audio/manifest.json').then(async response=>{
   if(!response.ok)throw new Error('Biblioteca de sons indisponível.')
   this.manifest=await response.json() as Manifest;return this.manifest
  }).catch(error=>{this.manifestPromise=null;throw error})
  return this.manifestPromise
 }
 private async buffer(clip:Clip){
  if(!this.context)await this.unlock()
  let promise=this.buffers.get(clip.url)
  if(!promise){promise=fetch(clip.url).then(async response=>{
   if(!response.ok)throw new Error('Som não encontrado: '+clip.url)
   return this.context!.decodeAudioData(await response.arrayBuffer())
  });this.buffers.set(clip.url,promise);promise.catch(()=>this.buffers.delete(clip.url))}
  return promise
 }
 async preload(ids:string[]){
  const manifest=await this.load()
  await Promise.all(['tema-arena','tema-arena-2'].map(name=>fetch('/arena/audio/'+name+'.mp3',{cache:'force-cache'}).then(response=>{if(!response.ok)throw new Error('Tema da arena indisponível');return response.arrayBuffer()})))
 const clips=[...new Map(Object.entries(manifest.cues).filter(([key])=>key.startsWith('ui:')||key.startsWith('world:')||ids.some(id=>key.startsWith(id+':'))).flatMap(([,clip])=>[clip,...(clip.layers||[])].map(layer=>[layer.url,layer] as const))).values()]
  // Baixa antes da luta; o decode acontece quando o contexto de áudio é liberado.
  await Promise.all(clips.map(async clip=>{if(this.context)await this.buffer(clip);else await fetch(clip.url,{cache:'force-cache'}).then(response=>{if(!response.ok)throw new Error('Falha no áudio');return response.arrayBuffer()})}))
 }
 async play(cue:string,x=ARENA_WIDTH/2){
  if(!this.enabled)return
  // Reserva antes dos awaits: click nativo e confirmação não criam duas vozes.
  if(cue.startsWith('ui:')){const now=performance.now();if(now-(this.uiAt.get(cue)??-Infinity)<85)return;this.uiAt.set(cue,now)}
  try{
   await this.unlock();const manifest=await this.load(),clip=manifest.cues[cue]||manifest.cues['world:'+cue]
   if(!clip||!this.context||this.context.state!=='running')return
   const layers=await Promise.all([clip,...(clip.layers||[])].map(async layer=>({layer,buffer:await this.buffer(layer)})))
   if(!this.enabled||this.voices.size>=24)return
   for(const {layer,buffer} of layers){
   const source=this.context.createBufferSource(),gain=this.context.createGain(),pan=this.context.createStereoPanner()
   const at=this.context.currentTime+(layer.delay||0),duration=Math.min(buffer.duration,clip.maxDuration||buffer.duration)
   source.buffer=buffer;gain.gain.setValueAtTime(layer.gain??.65,at);pan.pan.value=Math.max(-.65,Math.min(.65,(x-ARENA_WIDTH/2)/(ARENA_WIDTH*.65)))
   if(duration<buffer.duration)gain.gain.setTargetAtTime(.0001,at+Math.max(0,duration-.07),.02)
   source.connect(gain);gain.connect(pan);pan.connect(this.master!);this.voices.add(source)
   source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();pan.disconnect()}
   source.start(at);source.stop(at+duration);this.events++
   document.documentElement.dataset.arenaAudioEvents=String(this.events)
   }
  }catch{/* Falha de áudio não interrompe a física; a preparação exibe erro de download. */}
 }
}
export const arenaAudio=new ArenaAudio()
export const attackAudioCue=(id:string,kind:string,specialIndex=0)=>id+':'+(kind==='special'?'special'+specialIndex:kind)
