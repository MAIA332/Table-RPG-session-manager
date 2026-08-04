// components/soundpad.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "./ui/button"
import { Volume2, VolumeX, Play, Square, Repeat, Activity, Plus, Trash2, Link as LinkIcon, Save, Disc3, Settings2, Music } from "lucide-react"

export interface Track {
  id: string;
  name: string;
  url: string;
  loopable: boolean;
  isCustom?: boolean;
}

// Biblioteca Base
export const SOUND_LIBRARY: Track[] = [
  { id: "snd_sword", name: "Golpe de Espada", url: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/sword.mp3", loopable: false },
  { id: "snd_magic", name: "Impacto Mágico", url: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/magical_horror_audiosprite.mp3", loopable: false },
  { id: "snd_monster", name: "Grito do Monstro", url: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/alien_death1.mp3", loopable: false },
  { id: "snd_blaster", name: "Impacto Sonoro", url: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/SoundEffects/blaster.mp3", loopable: false },
  { id: "snd_music", name: "Música de Batalha (Exemplo)", url: "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/audio/oedipus_wizball_highscore.mp3", loopable: true },
]

export interface ActiveSound {
  id: string; 
  trackId: string; 
  url: string;
  loop: boolean;
}

interface SoundpadProps {
  isGm: boolean;
  campaignId: string;
  activeSounds: ActiveSound[];
  onPlaySound?: (track: { id: string, url: string }, loop: boolean) => void;
  onStopSound?: (id: string) => void;
  onStopAll?: () => void;
}

export function Soundpad({ isGm, campaignId, activeSounds, onPlaySound, onStopSound, onStopAll }: SoundpadProps) {
  const [globalVolume, setGlobalVolume] = useState(0.5);
  const [muted, setMuted] = useState(false);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});

  const [customTracks, setCustomTracks] = useState<Track[]>([]);
  const [newSoundName, setNewSoundName] = useState("");
  const [newSoundUrl, setNewSoundUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`custom_sounds_${campaignId}`);
      if (saved) {
        try { setCustomTracks(JSON.parse(saved)); } catch(e){}
      }
    }
  }, [campaignId]);

  const saveCustomTracks = (tracks: Track[]) => {
    setCustomTracks(tracks);
    localStorage.setItem(`custom_sounds_${campaignId}`, JSON.stringify(tracks));
  };

  const handleAddCustomSound = () => {
    if (!newSoundName.trim() || !newSoundUrl.trim()) return;
    const newTrack: Track = {
      id: "snd_custom_" + Math.random().toString(36).substring(2, 9),
      name: newSoundName,
      url: newSoundUrl,
      loopable: true,
      isCustom: true
    };
    saveCustomTracks([...customTracks, newTrack]);
    setNewSoundName("");
    setNewSoundUrl("");
  };

  const handleDeleteCustomSound = (id: string) => {
    if(!confirm("Remover este som da sua mesa?")) return;
    saveCustomTracks(customTracks.filter(t => t.id !== id));
  };

  useEffect(() => {
    const currentActiveIds = new Set(activeSounds.map(s => s.id));

    activeSounds.forEach(sound => {
      if (!audioRefs.current[sound.id]) {
        const audio = new Audio(sound.url);
        audio.loop = sound.loop;
        audio.volume = muted ? 0 : globalVolume;
        
        audio.onended = () => {
          if (onStopSound) onStopSound(sound.id);
        };

        audio.play().catch((err) => console.warn("Áudio não pôde ser tocado automaticamente:", err));
        audioRefs.current[sound.id] = audio;
      } else {
        audioRefs.current[sound.id].volume = muted ? 0 : globalVolume;
        audioRefs.current[sound.id].loop = sound.loop;
      }
    });

    Object.keys(audioRefs.current).forEach(id => {
      if (!currentActiveIds.has(id)) {
        const audio = audioRefs.current[id];
        audio.pause();
        audio.src = "";
        delete audioRefs.current[id];
      }
    });
  }, [activeSounds, globalVolume, muted, onStopSound]);

  useEffect(() => {
    return () => {
       // eslint-disable-next-line react-hooks/exhaustive-deps
       Object.values(audioRefs.current).forEach(a => { 
           a.pause(); 
           a.src = ""; 
       });
       audioRefs.current = {};
    };
  }, []);

  const allTracks = [...SOUND_LIBRARY, ...customTracks];
  const getTrackName = (trackId: string) => allTracks.find(t => t.id === trackId)?.name || "Som Extra";

  return (
    <div className="flex flex-col lg:flex-row w-full h-full bg-[#0a0a0a] text-white font-sans">
      
      {/* LADO ESQUERDO: BIBLIOTECA (Só visível se for GM) */}
      {isGm ? (
        <div className="flex-[2] flex flex-col min-h-0 border-r border-white/5 relative">
          <div className="p-8 pb-4 shrink-0">
            <h2 className="text-3xl font-black tracking-tight text-[#00E58F]">Biblioteca</h2>
            <p className="text-sm text-zinc-400 mt-1">Organize e gerencie seus sons com facilidade</p>
          </div>

          <div className="px-8 pb-4 flex justify-between items-center border-b border-white/5 shrink-0">
             <div className="bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Todos os Sons
             </div>
             <div className="hidden sm:flex text-[10px] font-bold text-zinc-500 uppercase tracking-widest gap-8 pr-12">
                <span>Duração</span>
                <span>Ação</span>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-3 custom-scrollbar-sepia">
            {allTracks.map(track => {
               const isPlaying = activeSounds.some(s => s.trackId === track.id);
               const activeInstances = activeSounds.filter(s => s.trackId === track.id);
               const isCustom = track.isCustom;
               
               return (
                 <div key={track.id} className={`group flex items-center justify-between p-3 pr-6 rounded-xl border transition-all duration-300 ${isPlaying ? 'bg-[#00E58F]/10 border-[#00E58F]/40 shadow-[0_0_15px_rgba(0,229,143,0.1)]' : 'bg-[#111] border-white/5 hover:bg-[#161616] hover:border-white/10'}`}>
                    
                    <div className="flex items-center gap-4 min-w-0 pr-2">
                       <div className={`flex items-center justify-center size-12 rounded-full shrink-0 transition-colors border ${isPlaying ? 'bg-[#00E58F] text-black border-[#00E58F]' : 'bg-black text-zinc-500 border-white/5 group-hover:text-white'}`}>
                          {isCustom ? <LinkIcon className="size-5" /> : <Disc3 className={`size-6 ${isPlaying ? 'animate-[spin_3s_linear_infinite]' : ''}`} />}
                       </div>
                       <div className="flex flex-col">
                          <span className={`font-bold text-base truncate ${isPlaying ? 'text-[#00E58F]' : 'text-zinc-200 group-hover:text-white'}`}>
                            {track.name}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded">MP3</span>
                             {isCustom && <span className="text-[9px] font-bold uppercase tracking-widest text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">Custom</span>}
                          </div>
                       </div>
                    </div>
                    
                    <div className="flex items-center gap-3 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                       <button 
                          className="flex items-center justify-center size-10 rounded-full bg-black text-zinc-300 hover:text-white hover:bg-white/10 border border-white/10 transition-all hover:scale-105" 
                          onClick={() => onPlaySound && onPlaySound(track, false)} 
                          title="Tocar 1x"
                       >
                          <Play className="size-4 ml-0.5" />
                       </button>

                       {track.loopable && (
                          <button 
                             className={`flex items-center justify-center size-10 rounded-full border transition-all hover:scale-105 ${activeInstances.some(a => a.loop) ? 'bg-[#00E58F] text-black border-[#00E58F]' : 'bg-black hover:bg-white/10 text-zinc-300 hover:text-white border-white/10'}`}
                             onClick={() => {
                                if (activeInstances.some(a => a.loop)) {
                                   const idToStop = activeInstances.find(a => a.loop)?.id;
                                   if(idToStop && onStopSound) onStopSound(idToStop);
                                } else {
                                   if(onPlaySound) onPlaySound(track, true);
                                }
                             }}
                             title="Tocar em Loop Finito"
                          >
                             <Repeat className="size-4" />
                          </button>
                       )}

                       {isCustom && (
                          <button 
                             className="flex items-center justify-center size-10 rounded-full bg-transparent hover:bg-red-500/20 text-zinc-500 hover:text-red-400 border border-transparent hover:border-red-500/30 transition-all ml-2" 
                             onClick={() => handleDeleteCustomSound(track.id)} 
                             title="Excluir Som"
                          >
                              <Trash2 className="size-4" />
                          </button>
                       )}
                    </div>
                 </div>
               )
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center p-8 bg-[#0a0a0a]">
          <div className="max-w-md space-y-4">
             <Disc3 className="size-16 mx-auto text-zinc-600 animate-[spin_10s_linear_infinite]" />
             <h3 className="text-xl font-bold text-zinc-300">Conectado ao Áudio da Mesa</h3>
             <p className="text-sm text-zinc-500">Você está escutando a ambiência e os efeitos sonoros gerenciados pelo Mestre de Jogo em tempo real.</p>
          </div>
        </div>
      )}

      {/* LADO DIREITO: INSPETOR E GERENCIAMENTO */}
      <div className="w-full lg:w-[380px] flex flex-col shrink-0 bg-[#111111]">
        
        {/* Tocando Agora */}
        {isGm && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-[250px] p-6 border-b border-white/5">
             <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold uppercase tracking-widest text-[#00E58F] flex items-center gap-2">
                   <Activity className="size-4" /> Agora a Jogar
                </h4>
                {activeSounds.length > 0 && (
                   <button onClick={onStopAll} className="text-[10px] uppercase font-bold text-red-400 hover:text-red-300 transition-colors" title="Parar todos os sons">
                      Parar Tudo
                   </button>
                )}
             </div>
             
             {activeSounds.length === 0 ? (
               <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-white/10 rounded-xl bg-black/20">
                  <Music className="size-8 text-zinc-600 mb-2" />
                  <p className="text-xs text-zinc-500 italic">Silêncio na sala...</p>
               </div>
             ) : (
               <div className="flex-1 overflow-y-auto custom-scrollbar-sepia pr-2 space-y-2">
                  {activeSounds.map(active => (
                    <div key={active.id} className="flex items-center justify-between bg-[#00E58F]/10 border border-[#00E58F]/30 p-3 rounded-lg group animate-in fade-in zoom-in-95 duration-200">
                       <div className="flex flex-col min-w-0 pr-3">
                           <span className="text-[#00E58F] font-bold truncate text-sm flex items-center gap-2">
                             {getTrackName(active.trackId)}
                           </span>
                           <span className="text-[9px] text-[#00E58F]/70 uppercase tracking-widest mt-0.5 flex items-center gap-1" title={active.loop ? "Loop Ativo" : "Efeito Único"}>
                              {active.loop ? <><Repeat className="size-3" /> Loop</> : "1x Shot"}
                           </span>
                       </div>
                       <button 
                          className="flex items-center justify-center size-8 rounded-full bg-black/50 text-zinc-400 hover:text-red-400 hover:bg-red-500/20 transition-all shrink-0" 
                          onClick={() => onStopSound && onStopSound(active.id)} 
                          title="Parar este som"
                       >
                          <Square className="size-3" />
                       </button>
                    </div>
                  ))}
               </div>
             )}
          </div>
        )}

        {/* Adicionar Som */}
        {isGm && (
          <div className="p-6 bg-black/20 shrink-0 border-b border-white/5">
             <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2"><Plus className="size-4" /> Adicionar Link MP3</h4>
             <div className="flex flex-col gap-3">
                <input type="text" value={newSoundName} onChange={e=>setNewSoundName(e.target.value)} placeholder="Nome do Áudio" className="bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-[#00E58F]/50 transition-colors placeholder:text-zinc-600" />
                <input type="text" value={newSoundUrl} onChange={e=>setNewSoundUrl(e.target.value)} placeholder="URL direta do arquivo" className="bg-[#0a0a0a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-[#00E58F]/50 transition-colors font-mono placeholder:text-zinc-600" />
                <Button variant="default" className="w-full gap-2 mt-1 h-11 bg-[#00E58F] text-black hover:bg-[#00E58F]/80 font-bold transition-all" onClick={handleAddCustomSound}>
                   <Save className="size-4" /> Salvar Etiqueta
                </Button>
             </div>
          </div>
        )}

        {/* Painel de Volume do Inspetor */}
        <div className="p-6 mt-auto">
           <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2">Mixer Principal</h4>
           <div className="flex items-center gap-4">
             <button onClick={() => setMuted(!muted)} className="text-zinc-400 hover:text-[#00E58F] transition-colors focus:outline-none" title="Mutar/Desmutar">
                {muted ? <VolumeX className="size-5 text-red-400" /> : <Volume2 className="size-5 text-[#00E58F]" />}
             </button>
             <input 
               type="range" min="0" max="1" step="0.05" 
               value={globalVolume} 
               onChange={(e) => { setGlobalVolume(parseFloat(e.target.value)); setMuted(false); }}
               className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer" 
               style={{ accentColor: '#00E58F' }}
             />
             <span className="text-xs font-mono font-bold text-[#00E58F] w-10 text-right">{Math.round(globalVolume * 100)}%</span>
           </div>
        </div>

      </div>
    </div>
  )
}