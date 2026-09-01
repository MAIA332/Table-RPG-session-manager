"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Store, Coins, X, PackageOpen, Package, Search, Sword, Shield, Gem, Eye, SearchX, ShoppingCart, Folder } from "lucide-react"

import { Button } from "@/components/ui/button"
import { EQUIPMENT } from "@/lib/game-data"
import type { Character, StoreFolder } from "@/lib/types"

const overlayVariants = { hidden: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.2 } } } as any
const modalVariants = { hidden: { opacity: 0, scale: 0.95, y: 20 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } }, exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } } } as any

interface StoreModalProps {
    isOpen: boolean
    onClose: () => void
    character: Character
    currentZenit: number
    customEquipment: any[]
    storeFolders: StoreFolder[]
    editable: boolean
    sellItem: (itemId: string, index: number) => void
    buyItem: (itemId: string) => void
    getEquipment: (id: string) => any
}

export function StoreModal({
    isOpen, onClose, character, currentZenit, customEquipment, storeFolders, editable, sellItem, buyItem, getEquipment
}: StoreModalProps) {

    const [storeSearch, setStoreSearch] = useState("")
    const [storeCategory, setStoreCategory] = useState("all")
    const [selectedStoreItem, setSelectedStoreItem] = useState<any | null>(null)

    // Pastas sempre ativas por padrão + pastas criadas pelo mestre
    const defaultFolders: StoreFolder[] = [
        { id: "system", name: "SISTEMA", isVisible: true, isSystem: true },
        { id: "custom", name: "CUSTOM", isVisible: true, isSystem: true },
    ]

    // Mescla as pastas do BD com as defaults, garantindo que as visíveis apareçam
    const allFolders = [...defaultFolders, ...(storeFolders || [])]
    const visibleFolders = allFolders.filter(f => f.isVisible || f.isSystem === true && f.isVisible !== false)

    const [activeFolderId, setActiveFolderId] = useState<string>(visibleFolders[0]?.id || "system")

    const getCategoryLabel = (cat: string) => {
        const labels: Record<string, string> = { weapon: "Arma", armor: "Armadura", shield: "Escudo", accessory: "Acessório" }
        return labels[cat] || cat
    }

    // Filtragem dos itens com base na PASTA SELECIONADA
    const filteredStoreItems = useMemo(() => {
        let folderItems = []

        if (activeFolderId === "system") {
            folderItems = EQUIPMENT
        } else if (activeFolderId === "custom") {
            folderItems = customEquipment.filter(item => !item.folderId || item.folderId === "custom")
        } else {
            folderItems = customEquipment.filter(item => item.folderId === activeFolderId)
        }

        return folderItems.filter((item: any) => {
            // Itens marcados como não compráveis ficam ocultos da loja.
            if (item.purchasable === false) return false

            const matchesSearch =
                item.name.toLowerCase().includes(storeSearch.toLowerCase()) ||
                (item.detail && item.detail.toLowerCase().includes(storeSearch.toLowerCase()))

            const matchesCategory =
                storeCategory === "all" || item.category === storeCategory

            return matchesSearch && matchesCategory
        })
    }, [activeFolderId, customEquipment, storeSearch, storeCategory])

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-2 md:p-6 overflow-hidden" onClick={onClose}>
                    <motion.div variants={modalVariants} className="rpg-modal relative flex h-full max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden border border-accent/30 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>

                        {/* Header da Loja */}
                        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 p-5 md:p-6 border-b border-white/10 bg-black/50 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-accent/10 border border-accent/20"><Store className="size-6 md:size-7 text-accent" /></div>
                                <div>
                                    <h4 className="font-serif text-xl md:text-2xl font-black text-[#eee3cf]">Mercado & Forja</h4>
                                    <p className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-muted-foreground">Equipamentos • Relíquias • Suprimentos</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between md:justify-end gap-3">
                                <div className="flex items-center gap-2 bg-background px-4 py-2 rounded-full border border-accent/20 shadow-inner">
                                    <Coins className="size-4 text-accent" />
                                    <span className="font-mono font-bold text-sm md:text-base text-foreground">{currentZenit} z</span>
                                </div>
                                <button onClick={onClose} className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"><X className="size-5 text-muted-foreground hover:text-white" /></button>
                            </div>
                        </div>

                        {/* Corpo da Loja */}
                        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">

                            {/* Mochila (Sidebar Esquerda) */}
                            <aside className="lg:w-[260px] xl:w-[300px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 bg-black/20 flex flex-col">
                                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                                    <div>
                                        <h5 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Sua Mochila</h5>
                                        <p className="text-[10px] text-muted-foreground mt-1">Venda seus equipamentos</p>
                                    </div>
                                    <span className="text-[10px] font-mono text-muted-foreground">{character.equipment.length} itens</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 custom-scrollbar-sepia">
                                    {character.equipment.length === 0 ? (
                                        <div className="h-full min-h-[120px] flex items-center justify-center">
                                            <div className="text-center p-6"><PackageOpen className="size-8 mx-auto text-muted-foreground/30 mb-2" /><p className="text-xs text-muted-foreground italic">Mochila vazia.</p></div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {character.equipment.map((id: string, index: number) => {
                                                const item = customEquipment.find((e: any) => e.id === id) || getEquipment(id)
                                                if (!item) return null
                                                const sellPrice = Math.floor(item.cost / 2)
                                                return (
                                                    <div key={`${id}-${index}`} className="group flex items-center gap-3 p-3 rounded-lg bg-card/60 border border-border/50 hover:border-accent/40 hover:bg-card transition-all">
                                                        <div className="size-9 shrink-0 rounded-md bg-black/40 border border-white/10 flex items-center justify-center"><Package className="size-4 text-accent/70" /></div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-bold text-xs text-foreground truncate">{item.name}</p>
                                                            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{getCategoryLabel(item.category)}</p>
                                                        </div>
                                                        <Button size="sm" variant="ghost" disabled={!editable} className="text-accent hover:bg-accent/10 shrink-0 px-2" onClick={() => sellItem(item.id, index)}>+{sellPrice}z</Button>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </aside>

                            {/* Área Principal (Filtros, Pastas e Vitrine) */}
                            <main className="flex-1 min-w-0 flex flex-col">
                                <div className="p-4 md:p-5 border-b border-white/10 bg-black/20 flex flex-col gap-4">

                                    {/* PASTAS DA LOJA */}
                                    <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar-sepia">
                                        {visibleFolders.map((folder) => (
                                            <button
                                                key={folder.id}
                                                onClick={() => { setActiveFolderId(folder.id); setSelectedStoreItem(null); }}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap border transition-all ${activeFolderId === folder.id ? "bg-accent/20 text-accent border-accent/50 shadow-inner" : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-foreground"}`}
                                            >
                                                <Folder className="size-4" />
                                                {folder.name}
                                            </button>
                                        ))}
                                    </div>

                                    {/* PESQUISA E FILTROS */}
                                    <div className="flex flex-col xl:flex-row gap-3">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                            <input type="text" value={storeSearch} onChange={(e) => setStoreSearch(e.target.value)} placeholder="Pesquisar nesta pasta..." className="w-full h-10 pl-10 pr-4 rounded-lg bg-background border border-border focus:border-accent/60 focus:outline-none text-sm" />
                                        </div>
                                        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar-sepia">
                                            {[["all", "Todos"], ["weapon", "Armas"], ["armor", "Armaduras"], ["shield", "Escudos"], ["accessory", "Acessórios"]].map(([id, label]) => (
                                                <button key={id} onClick={() => setStoreCategory(id)} className={`px-3 py-2 rounded-lg text-[10px] uppercase tracking-wider font-bold whitespace-nowrap border transition-all ${storeCategory === id ? "bg-accent text-accent-foreground border-accent" : "bg-white/5 text-muted-foreground border-white/10 hover:border-accent/30 hover:text-foreground"}`}>{label}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 custom-scrollbar-sepia">
                                    <div className="mb-4 flex items-end justify-between">
                                        <div>
                                            <h5 className="font-serif text-lg font-bold text-foreground">Vitrine</h5>
                                            <p className="text-xs text-muted-foreground">Selecione um item para examinar seus detalhes.</p>
                                        </div>
                                        <span className="text-[10px] font-mono text-muted-foreground">{filteredStoreItems.length} resultados</span>
                                    </div>

                                    {filteredStoreItems.length === 0 ? (
                                        <div className="h-48 flex flex-col items-center justify-center text-center"><SearchX className="size-8 text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">Nenhum item encontrado nesta pasta/filtro.</p><button onClick={() => { setStoreSearch(""); setStoreCategory("all") }} className="mt-2 text-xs text-accent hover:underline">Limpar filtros</button></div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                            {filteredStoreItems.map((item: any) => {
                                                const canAfford = currentZenit >= item.cost
                                                const selected = selectedStoreItem?.id === item.id
                                                return (
                                                    <motion.button layout key={item.id} onClick={() => setSelectedStoreItem(item)} className={`text-left group relative p-4 rounded-xl border transition-all duration-200 ${selected ? "border-accent bg-accent/10 shadow-lg shadow-accent/5" : canAfford ? "border-border/60 bg-card/50 hover:border-accent/40 hover:bg-card" : "border-destructive/20 bg-destructive/5 opacity-60"}`}>
                                                        <div className="absolute top-3 right-3"><div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono font-bold ${canAfford ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}><Coins className="size-3" /> {item.cost}z</div></div>
                                                        <div className="size-14 mb-4 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center group-hover:border-accent/30 transition-colors">
                                                            {item.category === "weapon" && <Sword className="size-7 text-accent/70" />}
                                                            {item.category === "armor" && <Shield className="size-7 text-accent/70" />}
                                                            {item.category === "shield" && <Shield className="size-7 text-accent/70" />}
                                                            {item.category === "accessory" && <Gem className="size-7 text-accent/70" />}
                                                        </div>
                                                        <div className="pr-16"><p className="font-bold text-sm text-foreground">{item.name}</p><p className="mt-1 text-[9px] uppercase tracking-widest text-accent/70">{getCategoryLabel(item.category)}</p></div>
                                                        <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between"><span className="text-[10px] text-muted-foreground">Clique para examinar</span><Eye className="size-3.5 text-muted-foreground group-hover:text-accent transition-colors" /></div>
                                                    </motion.button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </main>

                            {/* Inspetor de Item (Sidebar Direita) */}
                            <AnimatePresence mode="wait">
                                {selectedStoreItem && (
                                    <motion.aside initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="w-full lg:w-[340px] xl:w-[380px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/40 flex flex-col">
                                        <div className="p-5 border-b border-white/10">
                                            <div className="flex justify-between items-start gap-3">
                                                <div><p className="text-[9px] uppercase tracking-[0.2em] text-accent mb-1">Inspecionando</p><h5 className="font-serif text-xl font-bold text-foreground">{selectedStoreItem.name}</h5></div>
                                                <button onClick={() => setSelectedStoreItem(null)} className="p-1.5 rounded-md hover:bg-white/10"><X className="size-4 text-muted-foreground" /></button>
                                            </div>
                                        </div>
                                        <div className="p-6">
                                            <div className="aspect-square max-h-[180px] rounded-xl bg-gradient-to-br from-accent/10 via-black/30 to-black/60 border border-accent/20 flex items-center justify-center">
                                                {selectedStoreItem.category === "weapon" && <Sword className="size-24 text-accent/40" />}
                                                {selectedStoreItem.category === "armor" && <Shield className="size-24 text-accent/40" />}
                                                {selectedStoreItem.category === "shield" && <Shield className="size-24 text-accent/40" />}
                                                {selectedStoreItem.category === "accessory" && <Gem className="size-24 text-accent/40" />}
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto px-5 pb-5 custom-scrollbar-sepia">
                                            <div className="space-y-5">
                                                <div><p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">Descrição</p><div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{selectedStoreItem.detail}</div></div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="p-3 rounded-lg bg-card border border-border/50"><p className="text-[9px] uppercase tracking-widest text-muted-foreground">Categoria</p><p className="mt-1 text-xs font-bold text-foreground">{getCategoryLabel(selectedStoreItem.category)}</p></div>
                                                    <div className="p-3 rounded-lg bg-card border border-border/50"><p className="text-[9px] uppercase tracking-widest text-muted-foreground">Valor</p><p className="mt-1 text-xs font-bold text-accent font-mono">{selectedStoreItem.cost} z</p></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-5 border-t border-white/10 bg-black/30">
                                            {currentZenit >= selectedStoreItem.cost ? (
                                                <Button disabled={!editable} onClick={() => { buyItem(selectedStoreItem.id); setSelectedStoreItem(null) }} className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 font-bold"><ShoppingCart className="size-4 mr-2" /> Comprar por {selectedStoreItem.cost} z</Button>
                                            ) : (
                                                <div className="text-center p-3 rounded-lg bg-destructive/10 border border-destructive/20"><p className="text-xs font-bold text-destructive">Zenit insuficiente</p><p className="text-[10px] text-muted-foreground mt-1">Faltam {selectedStoreItem.cost - currentZenit} z</p></div>
                                            )}
                                        </div>
                                    </motion.aside>
                                )}
                            </AnimatePresence>

                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}