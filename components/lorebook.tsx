"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence, type Variants } from "framer-motion"
import {
    BookOpen, X, Plus, Edit3, Trash2, Eye, EyeOff,
    Search, Save, Image as ImageIcon, ShieldAlert,
    Check
} from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Member } from "./character-sheet"

// ==========================================
// TIPAGENS DO LOREBOOK
// ==========================================
export interface LoreEntry {
    id: string;
    title: string;
    category: string;
    quote: string;
    content: string;
    imageUrl: string;
    isPublic: boolean;
    allowedMembers: string[];
    createdAt: number;
}

interface LorebookProps {
    isOpen: boolean;
    onClose: () => void;
    isGm: boolean;
    myUserId: string;
    campaignMembers: Member[];
    entries: LoreEntry[];
    onSaveEntries: (newEntries: LoreEntry[]) => void;
}

const modalVariants: Variants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
    exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } }
}

export function Lorebook({
    isOpen,
    onClose,
    isGm,
    myUserId,
    campaignMembers,
    entries,
    onSaveEntries
}: LorebookProps) {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [isEditing, setIsEditing] = useState(false)

    // Estado do rascunho para criação/edição
    const [draft, setDraft] = useState<Partial<LoreEntry>>({})

    // Filtra as entradas baseado na permissão e na busca
    const visibleEntries = useMemo(() => {
        return entries.filter(entry => {
            // 1. Regra de Visibilidade (BLINDADA)
            const canSee = isGm || entry.isPublic || (entry.allowedMembers || []).includes(myUserId);
            if (!canSee) return false;

            // 2. Regra de Busca (BLINDADA)
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const title = entry.title || "";
                const category = entry.category || "";
                return title.toLowerCase().includes(query) || category.toLowerCase().includes(query);
            }

            return true;
        }).sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }, [entries, isGm, myUserId, searchQuery]);

    // Agrupa as entradas por categoria (BLINDADA)
    const groupedEntries = useMemo(() => {
        const groups: Record<string, LoreEntry[]> = {};
        visibleEntries.forEach(entry => {
            const cat = entry.category || "Geral";
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(entry);
        });
        return groups;
    }, [visibleEntries]);

    const selectedEntry = entries.find(e => e.id === selectedId) || null;

    // AÇÕES DO MESTRE
    const handleCreateNew = () => {
        setDraft({
            title: "",
            category: "Retratos",
            quote: "",
            content: "",
            imageUrl: "",
            isPublic: true,
            allowedMembers: []
        });
        setSelectedId(null);
        setIsEditing(true);
    }

    const handleEdit = (entry: LoreEntry) => {
        setDraft({ ...entry });
        setIsEditing(true);
    }

    const handleDelete = (id: string) => {
        if (!confirm("O Mestre deseja apagar este fragmento de Lore para sempre?")) return;
        const newEntries = entries.filter(e => e.id !== id);
        onSaveEntries(newEntries);
        if (selectedId === id) setSelectedId(null);
    }

    const handleSaveDraft = () => {
        if (!draft.title || !draft.content) {
            alert("O título e o conteúdo são obrigatórios.");
            return;
        }

        const newEntry: LoreEntry = {
            id: draft.id || `lore_${Math.random().toString(36).substring(2, 9)}`,
            title: draft.title,
            category: draft.category || "Geral",
            quote: draft.quote || "",
            content: draft.content,
            imageUrl: draft.imageUrl || "",
            isPublic: draft.isPublic ?? true,
            allowedMembers: draft.allowedMembers || [],
            createdAt: draft.createdAt || Date.now(),
        };

        let newEntries: LoreEntry[];
        if (draft.id) {
            newEntries = entries.map(e => e.id === draft.id ? newEntry : e);
        } else {
            newEntries = [...entries, newEntry];
        }

        onSaveEntries(newEntries);
        setSelectedId(newEntry.id);
        setIsEditing(false);
    }

    const toggleMemberPermission = (userId: string) => {
        const current = draft.allowedMembers || [];
        if (current.includes(userId)) {
            setDraft({ ...draft, allowedMembers: current.filter(id => id !== userId) });
        } else {
            setDraft({ ...draft, allowedMembers: [...current, userId] });
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="lorebook-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    // A MÁGICA 1: O padding (p-4 md:p-8) cria uma parede invisível nos cantos da tela
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 sm:p-6 md:p-8 overflow-hidden font-sans"
                    onClick={onClose}
                >
                    <motion.div
                        key="lorebook-modal"
                        variants={modalVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        // A MÁGICA 2: h-full força a modal a esticar até bater na parede do padding (sempre 100% visível)
                        className="rpg-modal rpg-themed-workspace relative flex h-full w-full max-w-7xl flex-col overflow-hidden border border-white/10 bg-[#121212] text-zinc-300 shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {/* HEADER */}
                        <div className="rpg-modal-header flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-4 sm:px-6">
                            <div className="flex items-center gap-3">
                                <BookOpen className="size-6 text-accent" />
                                <h2 className="rpg-title text-xl font-black text-foreground">Diário do Mundo</h2>
                            </div>
                            <div className="flex items-center gap-4">
                                {isGm && !isEditing && (
                                    <Button size="sm" onClick={handleCreateNew} className="gap-2 bg-accent text-black hover:bg-accent/80 font-bold">
                                        <Plus className="size-4" /> Escrever Lore
                                    </Button>
                                )}
                                <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full">
                                    <X className="size-5" />
                                </button>
                            </div>
                        </div>

                        {/* CORPO PRINCIPAL - Flexbox blindado */}
                        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">

                            {/* SIDEBAR - LISTA DE LORE */}
                            <div className="rpg-themed-subtle flex max-h-[34%] min-h-0 w-full shrink-0 flex-col border-b border-white/5 bg-[#17100c] md:max-h-none md:w-72 md:border-b-0 md:border-r">
                                <div className="p-4 border-b border-white/5 shrink-0">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600" />
                                        <input
                                            type="text"
                                            placeholder="Pesquisar registro..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="rpg-themed-deep w-full bg-[#161616] border border-white/5 rounded-md py-2 pl-9 pr-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-accent/50 transition-colors font-sans"
                                        />
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar-sepia py-2 min-h-0">
                                    {Object.keys(groupedEntries).length === 0 ? (
                                        <p className="text-center text-xs text-zinc-600 italic mt-8">Nenhum registro encontrado.</p>
                                    ) : (
                                        Object.entries(groupedEntries).map(([category, items]) => (
                                            <div key={category} className="mb-6">
                                                <h3 className="px-6 mb-2 text-[11px] font-bold text-zinc-500 uppercase tracking-widest">{category}</h3>
                                                <ul className="flex flex-col">
                                                    {items.map(entry => (
                                                        <li key={entry.id}>
                                                            <button
                                                                onClick={() => { setSelectedId(entry.id); setIsEditing(false); }}
                                                                className={`w-full text-left px-6 py-2.5 transition-all flex justify-between items-center ${selectedId === entry.id
                                                                        ? 'bg-white/10 text-white font-bold border-l-2 border-accent'
                                                                        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border-l-2 border-transparent'
                                                                    }`}
                                                            >
                                                                <span className="truncate">{entry.title}</span>
                                                                {!entry.isPublic && isGm && <EyeOff className="size-3 text-red-400/70 shrink-0" />}
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* ÁREA DE VISUALIZAÇÃO OU EDIÇÃO */}
                            <div className="rpg-themed-workspace flex min-h-0 min-w-0 flex-1 flex-col bg-[#1a130e]">
                                {isEditing && isGm ? (
                                    // ==========================================
                                    // MODO EDITOR (GM)
                                    // ==========================================
                                    <div className="flex flex-1 flex-col min-h-0 font-sans">

                                        {/* ÁREA SCROLLÁVEL (O Formulário) */}
                                        <div className="flex-1 overflow-y-auto custom-scrollbar-sepia p-4 md:p-8 min-h-0">
                                            <div className="panel mx-auto max-w-3xl space-y-6 rounded-sm border border-white/5 p-6 shadow-2xl md:p-8">

                                                <div className="border-b border-white/10 pb-4 mb-6">
                                                    <h3 className="text-lg font-bold text-accent flex items-center gap-2">
                                                        <Edit3 className="size-5" /> {draft.id ? "Reescrever Lore" : "Forjar Novo Lore"}
                                                    </h3>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <label className="flex flex-col gap-2">
                                                        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Título do Registro</span>
                                                        <input type="text" value={draft.title || ""} onChange={e => setDraft({ ...draft, title: e.target.value })} className="bg-black/50 border border-white/10 rounded-md p-3 text-white focus:outline-none focus:border-accent/50" placeholder="Ex: Lobo Guardião" />
                                                    </label>
                                                    <label className="flex flex-col gap-2">
                                                        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Categoria</span>
                                                        <input type="text" value={draft.category || ""} onChange={e => setDraft({ ...draft, category: e.target.value })} className="bg-black/50 border border-white/10 rounded-md p-3 text-white focus:outline-none focus:border-accent/50" placeholder="Ex: Retratos, Artefatos..." />
                                                    </label>
                                                </div>

                                                <label className="flex flex-col gap-2">
                                                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">URL da Imagem / Gravura (Opcional)</span>
                                                    <div className="relative">
                                                        <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-600" />
                                                        <input type="text" value={draft.imageUrl || ""} onChange={e => setDraft({ ...draft, imageUrl: e.target.value })} className="w-full bg-black/50 border border-white/10 rounded-md py-3 pl-10 pr-3 text-white focus:outline-none focus:border-accent/50" placeholder="https://..." />
                                                    </div>
                                                </label>

                                                <label className="flex flex-col gap-2">
                                                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Citação / Verso / Poema (Opcional)</span>
                                                    <textarea value={draft.quote || ""} onChange={e => setDraft({ ...draft, quote: e.target.value })} rows={2} className="bg-black/50 border border-white/10 rounded-md p-3 text-white focus:outline-none focus:border-accent/50 resize-none italic" placeholder="Pernas delgadas, brilho verdejante..." />
                                                </label>

                                                <label className="flex flex-col gap-2">
                                                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">O Lore (Descrição Detalhada)</span>
                                                    <textarea value={draft.content || ""} onChange={e => setDraft({ ...draft, content: e.target.value })} rows={10} className="bg-black/50 border border-white/10 rounded-md p-4 text-white focus:outline-none focus:border-accent/50 resize-y min-h-[150px] custom-scrollbar-sepia leading-relaxed" placeholder="Durante o reinado do maior imperador..." />
                                                </label>

                                                <div className="border border-white/10 rounded-lg p-5 bg-black/30">
                                                    <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-4"><ShieldAlert className="size-4 text-accent" /> Permissões de Leitura</h4>

                                                    <div className="flex flex-wrap gap-4 mb-4">
                                                        <Button type="button" variant={draft.isPublic !== false ? "default" : "outline"} onClick={() => setDraft({ ...draft, isPublic: true })} className={draft.isPublic !== false ? "bg-green-600/20 text-green-400 border-green-600/50 hover:bg-green-600/30" : "border-white/10"}>
                                                            <Eye className="size-4 mr-2" /> Conhecimento Público
                                                        </Button>
                                                        <Button type="button" variant={draft.isPublic === false ? "default" : "outline"} onClick={() => setDraft({ ...draft, isPublic: false, allowedMembers: draft.allowedMembers || [] })} className={draft.isPublic === false ? "bg-red-600/20 text-red-400 border-red-600/50 hover:bg-red-600/30" : "border-white/10"}>
                                                            <EyeOff className="size-4 mr-2" /> Segredo / Específico
                                                        </Button>
                                                    </div>

                                                    {draft.isPublic === false && (
                                                        <div className="mt-4 p-4 border border-white/5 rounded bg-black/50">
                                                            <p className="text-xs text-zinc-400 mb-3">Selecione quais jogadores podem ler este Lore:</p>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                                {campaignMembers.filter(m => m.role !== 'gm').map(member => {
                                                                    const isAllowed = (draft.allowedMembers || []).includes(member.userId);
                                                                    return (
                                                                        <button
                                                                            key={member.userId}
                                                                            type="button"
                                                                            onClick={() => toggleMemberPermission(member.userId)}
                                                                            className={`flex items-center gap-2 p-2 rounded border text-sm transition-colors text-left ${isAllowed ? 'bg-accent/20 border-accent/50 text-accent' : 'bg-[#111] border-white/5 text-zinc-500 hover:bg-white/5'}`}
                                                                        >
                                                                            <div className={`size-4 rounded-sm border flex items-center justify-center shrink-0 ${isAllowed ? 'border-accent bg-accent text-black' : 'border-zinc-600'}`}>
                                                                                {isAllowed && <Check className="size-3" />}
                                                                            </div>
                                                                            <span className="truncate">{member.name}</span>
                                                                        </button>
                                                                    )
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* FOOTER FIXO (Agora flui naturalmente no flex) */}
                                        <div className="rpg-themed-deep shrink-0 bg-[#121212] border-t border-white/5 p-4 px-6 md:px-8 flex justify-center shadow-[0_-15px_30px_-10px_rgba(0,0,0,0.8)] z-10">
                                            <div className="w-full max-w-3xl flex justify-end gap-3 items-center">
                                                <Button variant="ghost" onClick={() => setIsEditing(false)} className="text-zinc-400 hover:text-white">
                                                    Cancelar
                                                </Button>
                                                <Button onClick={handleSaveDraft} className="bg-accent text-black font-bold hover:bg-accent/80 gap-2">
                                                    <Save className="size-4" /> Salvar Lore
                                                </Button>
                                            </div>
                                        </div>

                                    </div>
                                ) : selectedEntry ? (
                                    // ==========================================
                                    // MODO VISUALIZAÇÃO
                                    // ==========================================
                                    <div className="flex flex-1 flex-col md:flex-row min-h-0 min-w-0">
                                        {/* COLUNA ESQUERDA: TEXTO */}
                                        <div className="rpg-paper m-3 min-h-0 min-w-0 flex-1 overflow-y-auto p-6 pb-16 custom-scrollbar-sepia sm:m-5 md:p-10 lg:pl-14">

                                            {isGm && (
                                                <div className="flex items-center gap-2 mb-8 bg-black/30 p-2 rounded-md w-fit border border-white/5">
                                                    <Button size="sm" variant="ghost" className="h-8 text-zinc-400 hover:text-white" onClick={() => handleEdit(selectedEntry)}>
                                                        <Edit3 className="size-4 mr-1.5" /> Editar
                                                    </Button>
                                                    <div className="w-px h-4 bg-white/10 mx-1"></div>
                                                    <Button size="sm" variant="ghost" className="h-8 text-zinc-400 hover:text-red-400" onClick={() => handleDelete(selectedEntry.id)}>
                                                        <Trash2 className="size-4 mr-1.5" /> Apagar
                                                    </Button>
                                                    {!selectedEntry.isPublic && (
                                                        <>
                                                            <div className="w-px h-4 bg-white/10 mx-1"></div>
                                                            <span className="text-[10px] text-red-400 uppercase tracking-widest flex items-center gap-1.5 px-2">
                                                                <EyeOff className="size-3" /> Secreto
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                key={selectedEntry.id}
                                            >
                                                <h1 className="mb-6 break-words font-serif text-3xl font-black leading-tight text-[#302218] md:text-4xl lg:text-5xl">
                                                    {selectedEntry.title}
                                                </h1>

                                                {selectedEntry.quote && (
                                                    <div className="mb-8 whitespace-pre-wrap border-l-2 border-[#8e6737] pl-4 font-editorial text-lg italic leading-relaxed text-[#62492f]">
                                                        {selectedEntry.quote}
                                                    </div>
                                                )}

                                                <div className="break-words whitespace-pre-wrap font-editorial text-lg leading-loose text-[#3b2a1d]">
                                                    {selectedEntry.content}
                                                </div>
                                            </motion.div>
                                        </div>

                                        {/* COLUNA DIREITA: A GRAVURA/PERGAMINHO */}
                                        <div className="rpg-themed-deep flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#120d0a] p-6 md:p-8 lg:p-12">
                                            {selectedEntry.imageUrl ? (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    key={`img-${selectedEntry.id}`}
                                                    className="relative w-full max-w-sm md:max-w-lg aspect-[3/4] flex items-center justify-center my-4 md:my-0"
                                                >
                                                    <div className="rpg-paper absolute inset-0 overflow-hidden rounded-[2px] bg-[#e3d1b1] shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
                                                        <div className="absolute inset-2 border-[1.5px] border-[#c0a071]/60 flex p-4">
                                                            <div className="relative w-full h-full mix-blend-multiply opacity-90 contrast-125 saturate-100">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={selectedEntry.imageUrl}
                                                                    alt={selectedEntry.title}
                                                                    className="w-full h-full object-contain filter sepia-[0.3]"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-black/20 to-transparent"></div>
                                                        <div className="absolute bottom-0 left-0 w-full h-4 bg-gradient-to-t from-black/20 to-transparent"></div>
                                                    </div>
                                                </motion.div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center opacity-20 py-8">
                                                    <BookOpen className="size-20 md:size-32 mb-4" />
                                                    <p className="font-serif text-xl">Sem Gravura</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    // ==========================================
                                    // ESTADO VAZIO
                                    // ==========================================
                                    <div className="rpg-empty m-5 flex min-h-0 flex-1 flex-col items-center justify-center border border-dashed border-border/40 p-8 text-center text-zinc-500">
                                        <BookOpen className="size-20 mb-6 opacity-20" />
                                        <p className="text-xl font-serif">A história aguarda para ser contada.</p>
                                        <p className="text-sm mt-2">Selecione um registro no menu ao lado para ler os mitos deste mundo.</p>
                                    </div>
                                )}
                            </div>

                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )

}
