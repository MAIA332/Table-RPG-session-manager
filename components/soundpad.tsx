// components/soundpad.tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "./ui/button"
import { Volume2, Play, Square, Repeat, Activity, Plus, Trash2, Link as LinkIcon, Save, Disc3, Music } from "lucide-react"

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
  customTracks?: Track[];
  musicVolume?: number;
  effectsVolume?: number;
  onCustomTracksChange?: (tracks: Track[]) => void;
  onMusicVolumeChange?: (volume: number) => void;
  onEffectsVolumeChange?: (volume: number) => void;
  onPlaySound?: (track: { id: string, url: string }, loop: boolean) => void;
  onStopSound?: (id: string) => void;
  onStopAll?: () => void;
}

export function Soundpad({ campaignId, isGm, activeSounds, customTracks = [], musicVolume = 0.5, effectsVolume = 0.5, onCustomTracksChange, onMusicVolumeChange, onEffectsVolumeChange, onPlaySound, onStopSound, onStopAll }: SoundpadProps) {
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const [folders, setFolders] = useState<SoundFolder[]>([])
  const [activeFolder, setActiveFolder] = useState("all")
  const [folderName, setFolderName] = useState("")
  const [search, setSearch] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [folderError, setFolderError] = useState("")
  const [reload, setReload] = useState(0)
  const savingRef = useRef(false)
  const generation = useRef(0)

  useEffect(() => {
    const version = ++generation.current
    const abort = new AbortController()
    setLoaded(false)
    setFolders([])
    setActiveFolder("all")
    setFolderError("")
    setSaving(false)
    savingRef.current = false
    if (!isGm) return () => { abort.abort(); generation.current++ }
    void fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/state`, { cache: "no-store", signal: abort.signal })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Não foi possível carregar as pastas.")
        if (version !== generation.current) return
        setFolders(normalizeSoundFolders(data.state?.soundFolders))
        setLoaded(true)
      }).catch(error => {
        if (version === generation.current && !abort.signal.aborted) setFolderError(error instanceof Error ? error.message : "Erro ao carregar pastas.")
      })
    return () => { abort.abort(); generation.current++ }
  }, [campaignId, isGm, reload])

  async function saveFolders(next: SoundFolder[]): Promise<boolean> {
    if (!isGm || !loaded || savingRef.current) return false
    savingRef.current = true
    setSaving(true)
    setFolderError("")
    const version = generation.current
    try {
      const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/state`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: { soundFolders: next } }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar as pastas.")
      if (!Array.isArray(data.state?.soundFolders)) throw new Error("Atualize lib/campaign-state.ts para habilitar o salvamento das pastas de sons.")
      if (version !== generation.current) return false
      setFolders(normalizeSoundFolders(data.state.soundFolders))
      return true
    } catch (error) {
      if (version === generation.current) setFolderError(error instanceof Error ? error.message : "Erro ao salvar pastas.")
      return false
    } finally {
      if (version === generation.current) { savingRef.current = false; setSaving(false) }
    }
  }

  async function createFolder() {
    const name = folderName.trim()
    if (!name) return
    const id = `sound-folder-${crypto.randomUUID()}`
    if (await saveFolders([...folders, { id, name, trackIds: [] }])) {
      setFolderName("")
      setActiveFolder(id)
    }
  }

  async function renameFolder(folder: SoundFolder) {
    const name = prompt("Novo nome da pasta:", folder.name)?.trim()
    if (name) await saveFolders(folders.map(entry => entry.id === folder.id ? { ...entry, name } : entry))
  }

  async function deleteFolder(folder: SoundFolder) {
    if (!confirm(`Excluir a pasta "${folder.name}"? Os sons serão mantidos em Sem pasta.`)) return
    if (await saveFolders(folders.filter(entry => entry.id !== folder.id))) setActiveFolder("all")
  }

  function moveTrack(trackId: string, folderId: string) {
    void saveFolders(folders.map(folder => ({ ...folder, trackIds: [
      ...folder.trackIds.filter(id => id !== trackId), ...(folder.id === folderId ? [trackId] : []),
    ] })))
  }


  const [newSoundName, setNewSoundName] = useState("");
  const [newSoundUrl, setNewSoundUrl] = useState("");

  const saveCustomTracks = (tracks: Track[]) => {
    onCustomTracksChange?.(tracks);
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
      const volume = sound.loop ? musicVolume : effectsVolume;
      if (!audioRefs.current[sound.id]) {
        const audio = new Audio(sound.url);
        audio.loop = sound.loop;
        audio.volume = volume;
        
        audio.onended = () => {
          if (onStopSound) onStopSound(sound.id);
        };

        audio.play().catch((err) => console.warn("Áudio não pôde ser tocado automaticamente:", err));
        audioRefs.current[sound.id] = audio;
      } else {
        audioRefs.current[sound.id].volume = volume;
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
  }, [activeSounds, musicVolume, effectsVolume, onStopSound]);

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
  const folderForTrack = (id: string) => folders.find(folder => folder.trackIds.includes(id))?.id || "unfiled"
  const visibleTracks = allTracks.filter(track =>
    (activeFolder === "all" || folderForTrack(track.id) === activeFolder) &&
    track.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  )
  const getTrackName = (trackId: string) => allTracks.find(t => t.id === trackId)?.name || "Som Extra";

  return (
    <div className="rpg-themed-workspace flex h-full w-full flex-col overflow-y-auto bg-[#15100c] font-sans text-white lg:flex-row lg:overflow-hidden">
      
      {/* LADO ESQUERDO: BIBLIOTECA (Só visível se for GM) */}
      {isGm ? (
        <div className="relative flex min-h-[420px] flex-[2] flex-col border-r border-white/5 lg:min-h-0">
          <div className="p-8 pb-4 shrink-0">
            <span className="rpg-kicker mb-2">Arquivo sonoro</span>
            <h2 className="rpg-title text-3xl font-black">Biblioteca de sons</h2>
            <p className="text-sm text-zinc-400 mt-1">Organize e gerencie seus sons com facilidade</p>
          </div>

          <div className="px-6 pb-4 space-y-3 border-b border-white/5">
            <input aria-label="Pesquisar sons" placeholder="Pesquisar sons nesta pasta..." value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded border border-white/15 bg-black/40 p-2 text-sm" />
            <div className="flex gap-2">
              <input aria-label="Nome da nova pasta" maxLength={100} placeholder="Nome da nova pasta" value={folderName} disabled={!loaded || saving} onChange={e => setFolderName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void createFolder() } }} className="min-w-0 flex-1 rounded border border-white/15 bg-black/40 p-2 text-sm" />
              <Button disabled={!loaded || saving || !folderName.trim()} onClick={() => void createFolder()}>+ Nova pasta</Button>
            </div>
            <nav aria-label="Pastas de sons" className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
              {[{ id: "all", name: "Todos os sons" }, { id: "unfiled", name: "Sem pasta" }, ...folders].map(folder => <button type="button" key={folder.id} disabled={!loaded || saving} aria-pressed={activeFolder === folder.id} onClick={() => setActiveFolder(folder.id)} className={`rounded border px-3 py-2 text-xs ${activeFolder === folder.id ? "border-amber-300 bg-amber-300/10 text-amber-100" : "border-white/15 text-zinc-300"}`}>
                {folder.name} ({allTracks.filter(track => folder.id === "all" || folderForTrack(track.id) === folder.id).length})
              </button>)}
            </nav>
            {folders.filter(folder => folder.id === activeFolder).map(folder => <div key={folder.id} className="flex gap-4 text-xs">
              <button disabled={saving} onClick={() => void renameFolder(folder)} className="text-amber-200">Renomear pasta</button>
              <button disabled={saving} onClick={() => void deleteFolder(folder)} className="text-red-300">Excluir pasta</button>
            </div>)}
            {saving && <p role="status" className="text-xs text-amber-200">Salvando organização...</p>}
            {!loaded && !folderError && <p role="status" className="text-xs text-zinc-400">Carregando pastas...</p>}
            {folderError && <div role="alert" className="text-sm text-red-300">{folderError}{!loaded && <button className="ml-3 underline" onClick={() => setReload(value => value + 1)}>Tentar novamente</button>}</div>}
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-3 custom-scrollbar-sepia">
            {loaded && visibleTracks.length === 0 && <p className="text-sm text-zinc-400">Nenhum som nesta pasta corresponde à pesquisa.</p>}
            {visibleTracks.map(track => {
               const isPlaying = activeSounds.some(s => s.trackId === track.id);
               const activeInstances = activeSounds.filter(s => s.trackId === track.id);
               const isCustom = track.isCustom;
               
               return (
                 <div key={track.id} data-active={isPlaying} className={`rpg-themed-card group flex items-center justify-between rounded-sm border p-3 pr-6 transition-all duration-300 ${isPlaying ? 'border-accent/50 bg-accent/10 shadow-inner' : 'border-white/5 bg-[#17110d] hover:border-primary/40 hover:bg-[#211810]'}`}>
                    
                    <div className="flex items-center gap-4 min-w-0 pr-2">
                       <div className={`flex size-12 shrink-0 items-center justify-center rounded-full border transition-colors ${isPlaying ? 'border-accent bg-accent text-black' : 'border-primary/20 bg-black text-zinc-500 group-hover:text-accent'}`}>
                          {isCustom ? <LinkIcon className="size-5" /> : <Disc3 className={`size-6 ${isPlaying ? 'animate-[spin_3s_linear_infinite]' : ''}`} />}
                       </div>
                       <div className="flex flex-col">
                          <span className={`truncate text-base font-bold ${isPlaying ? 'text-accent' : 'text-zinc-200 group-hover:text-white'}`}>
                            {track.name}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded">MP3</span>
                             {isCustom && <span className="rounded-sm border border-primary/25 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary">Personalizado</span>}
                          </div>
                          <select aria-label={`Mover ${track.name} para pasta`} value={folderForTrack(track.id)} disabled={!loaded || saving} onChange={e => moveTrack(track.id, e.target.value)} className="mt-2 max-w-full rounded border border-white/15 bg-zinc-900 p-1 text-xs">
                            <option value="unfiled">Sem pasta</option>
                            {folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                          </select>
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
                             className={`flex size-10 items-center justify-center rounded-full border transition-all hover:scale-105 ${activeInstances.some(a => a.loop) ? 'border-accent bg-accent text-black' : 'border-white/10 bg-black text-zinc-300 hover:bg-white/10 hover:text-white'}`}
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
        <div className="rpg-themed-workspace flex flex-1 items-center justify-center bg-[#15100c] p-8 text-center">
          <div className="max-w-md space-y-4">
             <Disc3 className="size-16 mx-auto text-zinc-600 animate-[spin_10s_linear_infinite]" />
             <h3 className="text-xl font-bold text-zinc-300">Conectado ao Áudio da Mesa</h3>
             <p className="text-sm text-zinc-500">Você está escutando a ambiência e os efeitos sonoros gerenciados pelo Mestre em tempo real.</p>
          </div>
        </div>
      )}

      {/* LADO DIREITO: INSPETOR E GERENCIAMENTO */}
      <div className="rpg-themed-subtle flex w-full shrink-0 flex-col border-l border-primary/15 bg-[#1c1510] lg:w-[380px]">
        
        {/* Tocando Agora */}
        {isGm && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-[250px] p-6 border-b border-white/5">
             <div className="flex items-center justify-between mb-4">
                <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent">
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
                    <div key={active.id} className="group flex animate-in items-center justify-between rounded-sm border border-accent/30 bg-accent/10 p-3 fade-in zoom-in-95 duration-200">
                       <div className="flex flex-col min-w-0 pr-3">
                           <span className="flex items-center gap-2 truncate text-sm font-bold text-accent">
                             {getTrackName(active.trackId)}
                           </span>
                           <span className="mt-0.5 flex items-center gap-1 text-[9px] uppercase tracking-widest text-accent/70" title={active.loop ? "Loop Ativo" : "Efeito Único"}>
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
                <input type="text" value={newSoundName} onChange={e=>setNewSoundName(e.target.value)} placeholder="Nome do Áudio" className="rpg-themed-deep rounded-sm border border-white/10 bg-[#0a0a0a] px-4 py-2.5 text-sm text-foreground transition-colors placeholder:text-zinc-600 focus:border-primary/60 focus:outline-none" />
                <input type="text" value={newSoundUrl} onChange={e=>setNewSoundUrl(e.target.value)} placeholder="URL direta do arquivo" className="rpg-themed-deep rounded-sm border border-white/10 bg-[#0a0a0a] px-4 py-2.5 font-mono text-sm text-foreground transition-colors placeholder:text-zinc-600 focus:border-primary/60 focus:outline-none" />
                <Button variant="default" className="mt-1 h-11 w-full gap-2 font-bold" onClick={handleAddCustomSound}>
                   <Save className="size-4" /> Salvar som em Sem pasta
                </Button>
             </div>
          </div>
        )}

        <div className="p-6 mt-auto">
           <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3 flex items-center gap-2">Mixer Principal</h4>
           <div>
             <div className="flex items-center gap-4">
               <Volume2 className="size-5 text-accent" />
               <div className="flex-1 min-w-0">
                 <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                   <span>Efeitos sonoros</span>
                   <span className="font-mono text-accent">{Math.round(effectsVolume * 100)}%</span>
                 </div>
                 <input
                   type="range"
                   min="0"
                   max="1"
                   step="0.01"
                   value={effectsVolume}
                   onChange={(e) => {
                     const volume = parseFloat(e.target.value)
                     onMusicVolumeChange?.(volume)
                     onEffectsVolumeChange?.(volume)
                   }}
                   className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                   style={{ accentColor: 'var(--accent)' }}
                 />
               </div>
             </div>
           </div>
        </div>

      </div>
    </div>
  )
}


interface SoundFolder {
  id: string
  name: string
  trackIds: string[]
}

function normalizeSoundFolders(value: unknown): SoundFolder[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const tracks = new Set<string>()
  return value.flatMap(entry => {
    if (!entry || typeof entry.id !== "string" || !entry.id || ["all", "unfiled"].includes(entry.id) || ids.has(entry.id) || typeof entry.name !== "string" || !entry.name.trim()) return []
    ids.add(entry.id)
    const trackIds: string[] = []
    for (const id of Array.isArray(entry.trackIds) ? entry.trackIds : []) {
      if (typeof id === "string" && !tracks.has(id)) { tracks.add(id); trackIds.push(id) }
    }
    return [{ id: entry.id, name: entry.name.trim(), trackIds }]
  })
}
