// components/cutscene-manager.tsx
"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Clapperboard, Film, MonitorPlay, Plus, Trash2, X } from "lucide-react"
import { Button } from "./ui/button"
import { Cutscene, SceneMediaType } from "./cutscene-types"

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.2 } } } as any
const modalVariants = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }, exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } } } as any

interface CutsceneManagerProps {
  isOpen: boolean;
  onClose: () => void;
  cutscenes: Cutscene[];
  onSave: (cutscenes: Cutscene[]) => void;
  onPlay: (id: string) => void;
}

export function CutsceneManager({ isOpen, onClose, cutscenes, onSave, onPlay }: CutsceneManagerProps) {
  const [editingCutscene, setEditingCutscene] = useState<Cutscene | null>(null);

  const handleCreateCutscene = () => {
    const newId = Math.random().toString(36).substring(7);
    const newC: Cutscene = { id: newId, name: "Nova Cutscene", scenes: [] };
    onSave([...cutscenes, newC]);
    setEditingCutscene(newC);
  };

  const handleUpdateEditing = (updated: Cutscene) => {
    setEditingCutscene(updated);
    onSave(cutscenes.map(x => x.id === updated.id ? updated : x));
  };

  const handleDeleteCutscene = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSave(cutscenes.filter(x => x.id !== id));
    if (editingCutscene?.id === id) setEditingCutscene(null);
  };

  const handleClose = () => {
    setEditingCutscene(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 overflow-hidden" onClick={handleClose}>
          <motion.div variants={modalVariants} className="rpg-modal relative flex h-full max-h-[85vh] w-full max-w-4xl flex-col border border-primary/50 bg-zinc-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            
            <div className="rpg-modal-header flex shrink-0 items-center justify-between border-b border-white/10 p-6">
              <div>
                <h4 className="font-serif text-2xl font-black flex items-center gap-2"><Clapperboard className="size-6 text-primary" /> <span className="text-foreground">Gerenciar cenas</span></h4>
                <p className="text-sm text-muted-foreground mt-1">Crie sequências de texto, imagens ou vídeos para narrativa visual.</p>
              </div>
              <button onClick={handleClose} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 text-muted-foreground hover:text-white" /></button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
               {/* Lista de Cutscenes */}
               <div className="flex max-h-[34%] w-full flex-col gap-3 overflow-y-auto border-b border-white/10 bg-black/20 p-4 custom-scrollbar-sepia md:max-h-none md:w-1/3 md:border-b-0 md:border-r">
                  <Button variant="outline" className="w-full gap-2 border-dashed border-primary/50 text-primary hover:bg-primary/10 h-10" onClick={handleCreateCutscene}>
                     <Plus className="size-4" /> Criar Cutscene
                  </Button>
                  
                  {cutscenes.map(c => (
                     <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors cursor-pointer ${editingCutscene?.id === c.id ? 'border-primary bg-primary/20' : 'border-white/10 bg-black/40 hover:border-primary/40'}`} onClick={() => setEditingCutscene(c)}>
                        <div className="flex flex-col min-w-0 pr-2">
                           <span className="text-sm font-bold text-white truncate">{c.name}</span>
                           <span className="text-[10px] text-muted-foreground uppercase tracking-widest">{c.scenes.length} Cenas</span>
                        </div>
                        <div className="flex items-center gap-1">
                           <button onClick={(e) => handleDeleteCutscene(c.id, e)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/20 rounded">
                              <Trash2 className="size-3" />
                           </button>
                           <button onClick={(e) => { e.stopPropagation(); onPlay(c.id); }} className="p-1.5 text-primary hover:text-white hover:bg-primary rounded bg-primary/20">
                              <MonitorPlay className="size-3" />
                           </button>
                        </div>
                     </div>
                  ))}
               </div>

               {/* Editor de Cenas */}
               <div className="flex-1 p-6 overflow-y-auto custom-scrollbar-sepia">
                  {!editingCutscene ? (
                     <div className="rpg-empty flex h-full items-center justify-center border border-dashed border-white/10 bg-black/20 text-sm italic text-muted-foreground">
                        Selecione uma cutscene para editar.
                     </div>
                  ) : (
                     <div className="flex flex-col gap-6">
                        <label className="flex flex-col gap-2">
                           <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nome da Cutscene</span>
                           <input type="text" value={editingCutscene.name} onChange={(e) => handleUpdateEditing({ ...editingCutscene, name: e.target.value })} className="bg-black/40 border border-white/10 rounded-md p-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
                        </label>

                        <div className="flex flex-col gap-4">
                           <div className="flex items-center justify-between border-b border-white/10 pb-2">
                              <h5 className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2"><Film className="size-4" /> Cenas ({editingCutscene.scenes.length})</h5>
                           </div>
                           
                           {editingCutscene.scenes.map((scene, sIdx) => (
                              <div key={scene.id} className="group relative flex flex-col gap-3 rounded-sm border border-white/10 bg-black/30 p-4">
                                 <button onClick={() => {
                                    const newScenes = editingCutscene.scenes.filter((_, i) => i !== sIdx);
                                    handleUpdateEditing({ ...editingCutscene, scenes: newScenes });
                                 }} className="absolute top-3 right-3 p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded border border-red-500/30 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="size-3" />
                                 </button>

                                 <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-mono font-bold bg-primary/20 text-primary px-2 py-0.5 rounded">#{sIdx + 1}</span>
                                    <select value={scene.type} onChange={(e) => {
                                       const newScenes = [...editingCutscene.scenes];
                                       newScenes[sIdx].type = e.target.value as SceneMediaType;
                                       handleUpdateEditing({ ...editingCutscene, scenes: newScenes });
                                    }} className="bg-black/40 border border-white/10 rounded-md p-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50">
                                       <option value="text">Texto Dinâmico (Typewriter)</option>
                                       <option value="image">Imagem (URL)</option>
                                       <option value="video">Vídeo Youtube (URL)</option>
                                    </select>
                                 </div>

                                 {scene.type === 'text' ? (
                                    <textarea value={scene.content} onChange={(e) => {
                                       const newScenes = [...editingCutscene.scenes];
                                       newScenes[sIdx].content = e.target.value;
                                       handleUpdateEditing({ ...editingCutscene, scenes: newScenes });
                                    }} placeholder="Texto longo que vai aparecer sendo digitado..." rows={3} className="w-full bg-black/60 border border-white/5 rounded-md p-3 text-sm font-serif text-white focus:outline-none focus:border-primary/50 resize-none" />
                                 ) : (
                                    <input type="text" value={scene.content} onChange={(e) => {
                                       const newScenes = [...editingCutscene.scenes];
                                       newScenes[sIdx].content = e.target.value;
                                       handleUpdateEditing({ ...editingCutscene, scenes: newScenes });
                                    }} placeholder={`URL direta ${scene.type === 'video' ? 'do Youtube' : 'da Imagem'}`} className="w-full bg-black/60 border border-white/5 rounded-md p-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 font-mono" />
                                 )}
                              </div>
                           ))}

                           <Button variant="outline" className="w-full border-dashed border-white/20 text-muted-foreground hover:text-white" onClick={() => {
                              const newScenes = [...editingCutscene.scenes, { id: Math.random().toString(36).substring(7), type: "text" as SceneMediaType, content: "" }];
                              handleUpdateEditing({ ...editingCutscene, scenes: newScenes });
                           }}>
                              <Plus className="size-4 mr-2" /> Adicionar Cena
                           </Button>
                        </div>
                     </div>
                  )}
               </div>
            </div>

            <div className="p-6 border-t border-border/50 bg-black/40 flex justify-end gap-3 shrink-0">
               <Button variant="ghost" onClick={handleClose}>Fechar Editor</Button>
               {editingCutscene && editingCutscene.scenes.length > 0 && (
                  <Button className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-bold" onClick={() => onPlay(editingCutscene.id)}>
                     <MonitorPlay className="size-4" /> Dar Play na Sessão
                  </Button>
               )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
