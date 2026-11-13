"use client"
import { controllerAlert, controllerConfirm } from '@/lib/input/dialogs'
import { normalizeStoreFolders } from "@/lib/store-folders"
import { useState, useMemo, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useController } from "@/components/controller/controller-provider"
import { ControllerGlyph } from "@/components/controller/controller-glyph"
import { useControllerActions } from "@/lib/input/use-controller-actions"
import { controllerFocus } from "@/lib/input/focus"
import {
  Store,
  Coins,
  X,
  PackageOpen,
  Package,
  Search,
  Sword,
  Shield,
  Gem,
  Eye,
  SearchX,
  ShoppingCart,
  Folder,
  Scale,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ItemArtwork } from "./item-artwork"
import { itemImageUrl } from "@/lib/item-image"
import {
  formatWeight,
  inventoryStatus,
  itemWeightGrams,
  assertInventoryChange,
} from "@/lib/inventory-weight"
import { EQUIPMENT } from "@/lib/game-data"
import type { Character, StoreFolder } from "@/lib/types"

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0, transition: { duration: 0.2 } },
} as any
const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } },
} as any

const STORE_CATEGORIES = [
  ['all', 'Todos'], ['weapon', 'Armas'], ['armor', 'Armaduras'],
  ['shield', 'Escudos'], ['accessory', 'Acessórios'], ['misc', 'Diversos'],
] as const

interface StoreModalProps {
  isOpen: boolean
  onClose: () => void
  character: Character
  currentZenit: number
  customEquipment: any[]
  storeFolders: StoreFolder[]
  editable: boolean
  sellItem: (itemId: string, index: number) => Promise<boolean> | boolean
  buyItem: (itemId: string) => Promise<boolean> | boolean
  getEquipment: (id: string) => any
}

export function StoreModal({
  isOpen,
  onClose,
  character,
  currentZenit,
  customEquipment,
  storeFolders,
  editable,
  sellItem,
  buyItem,
  getEquipment,
}: StoreModalProps) {
  const [storeSearch, setStoreSearch] = useState("")
  const [storeCategory, setStoreCategory] = useState("all")
  const [selectedBagIndex, setSelectedBagIndex] = useState<number | null>(null)
  const busyRef = useRef(false)
  const [selectedStoreItem, setSelectedStoreItem] = useState<any | null>(null)
  const { active: controllerActive } = useController()
  const marketRef = useRef<HTMLDivElement>(null)
  const focusedZone = useRef<'bag' | 'catalog' | 'inspect'>('catalog')
  const lastFocusedByZone = useRef<Partial<Record<'bag' | 'catalog' | 'inspect', HTMLElement>>>({})

  /** Muda entre as áreas sem perder o cursor no catálogo ao inspecionar um item. */
  const focusZone = (zone: 'bag' | 'catalog' | 'inspect'): boolean => {
    const root = marketRef.current
    if (!root) return false
    const visible = (el: HTMLElement) => {
      const bounds = el.getBoundingClientRect()
      return bounds.width > 0 && bounds.height > 0 && !el.matches(':disabled')
    }
    const last = lastFocusedByZone.current[zone]
    const candidates = [...root.querySelectorAll<HTMLElement>(`[data-store-zone="${zone}"]`)].filter(visible)
    const preferred = zone === 'catalog'
      ? root.querySelector<HTMLElement>('[data-store-card]')
      : zone === 'inspect' ? root.querySelector<HTMLElement>('[data-store-buy]') : null
    const target = last?.isConnected && visible(last) && candidates.includes(last)
      ? last : preferred && visible(preferred) ? preferred : candidates[0]
    if (!target) return false
    focusedZone.current = zone
    target.focus({preventScroll: true})
    target.scrollIntoView({block:'nearest',inline:'nearest'})
    return true
  }
  const focusVisibleCatalogCard = (id?: string) => {
    const root = marketRef.current
    const card = [...(root?.querySelectorAll<HTMLElement>('[data-store-card]') ?? [])]
      .find(el => !!id && el.dataset.storeItemId === id)
    if (card) {
      card.focus({preventScroll:true})
      card.scrollIntoView({block:'nearest',inline:'nearest'})
      focusedZone.current='catalog'
      return true
    }
    return focusZone('catalog')
  }
  useEffect(() => {
    if (!isOpen || !controllerActive) return
    const frame = requestAnimationFrame(() => {focusVisibleCatalogCard()})
    return () => cancelAnimationFrame(frame)
    // Apenas quando o modal abre ou o usuário começa a usar controle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, controllerActive])
  useEffect(() => {
    if (!isOpen) return
    const listener = (event: FocusEvent) => {
      if (!(event.target instanceof HTMLElement) || !marketRef.current?.contains(event.target)) return
      const zone = event.target.dataset.storeZone as 'bag' | 'catalog' | 'inspect' | undefined
      if (zone && ['bag','catalog','inspect'].includes(zone)) {
        focusedZone.current = zone
        lastFocusedByZone.current[zone] = event.target
      }
    }
    document.addEventListener('focusin',listener)
    return () => document.removeEventListener('focusin',listener)
  }, [isOpen])
  // Após uma venda, o botão que estava em foco pode ser removido pelo React.
  // Recupera o foco na mochila sem roubar o foco de diálogos de confirmação.
  const inventorySignature = character.equipment.join('|')
  useEffect(() => {
    if (!isOpen || !controllerActive || focusedZone.current !== 'bag') return
    const frame=requestAnimationFrame(()=>{
      const root=marketRef.current
      if(!root)return
      const dialogs=[...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')]
        .filter(el=>{const bounds=el.getBoundingClientRect();return bounds.width>0&&bounds.height>0})
      if(dialogs.at(-1)!==root)return
      if(!root.contains(document.activeElement)) focusZone('bag') || focusZone('catalog')
    })
    return ()=>cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[inventorySignature,isOpen,controllerActive])

  const focusAdjacentZone = (offset: number) => {
    const zones: Array<'bag' | 'catalog' | 'inspect'> = ['bag', 'catalog', 'inspect']
    const active = document.activeElement as HTMLElement | null
    const present = active?.dataset.storeZone as typeof zones[number] | undefined
    const starting = zones.indexOf(present && zones.includes(present) ? present : focusedZone.current)
    for (let step=1;step<=zones.length;step++) {
      const zone=zones[(starting+offset*step+zones.length*2)%zones.length]
      if(focusZone(zone))return true
    }
    return true
  }
  const changeCategory = (direction: -1 | 1) => {
    const index = STORE_CATEGORIES.findIndex(([id]) => id === storeCategory)
    const next = STORE_CATEGORIES[(index + direction + STORE_CATEGORIES.length) % STORE_CATEGORIES.length][0]
    setStoreCategory(next)
    setSelectedStoreItem(null)
    requestAnimationFrame(() => focusVisibleCatalogCard())
    return true
  }
  const changeFolder = (direction: -1 | 1) => {
    if (!visibleFolders.length) return true
    const index = visibleFolders.findIndex(folder => folder.id === activeFolderId)
    const folder = visibleFolders[(Math.max(0, index) + direction + visibleFolders.length) % visibleFolders.length]
    setActiveFolderId(folder.id)
    setSelectedStoreItem(null)
    setStoreCategory('all')
    requestAnimationFrame(() => focusVisibleCatalogCard())
    return true
  }
  const buySelected = async () => {
    if (!editable || busyRef.current) return false
    const card = marketRef.current?.querySelector<HTMLElement>('[data-store-card]:focus')
    const item = filteredStoreItems.find(entry => entry.id === card?.dataset.storeItemId) || selectedStoreItem
    if (!item) { focusZone('catalog'); return false }
    if (currentZenit < item.cost) { controllerAlert('Zenits insuficientes para esta compra.'); return false }
    if (!(await controllerConfirm(`Comprar “${item.name}” por ${item.cost} Zenits? Peso adicional: ${formatWeight(itemWeightGrams(item))}.`))) return false
    busyRef.current = true
    try {
      const success = await purchase(item.id)
      if (success) {
        setSelectedStoreItem(null)
        requestAnimationFrame(() => focusVisibleCatalogCard(item.id))
      }
      return success
    } finally { busyRef.current = false }
  }
  const sellSelectedAt = async (requestedIndex?: number) => {
    if (!editable || busyRef.current) return false
    const focused = document.activeElement as HTMLElement | null
    const focusIndex = focused?.dataset.storeZone === 'bag' ? Number(focused.dataset.storeItemIndex) : NaN
    if (requestedIndex === undefined && focusedZone.current !== 'bag' && focused?.dataset.storeZone !== 'bag') {
      focusZone('bag')
      return false
    }
    const index = requestedIndex ?? (Number.isInteger(focusIndex) && focusIndex >= 0 ? focusIndex : selectedBagIndex)
    if (index == null || index < 0 || !character.equipment[index]) { focusZone('bag'); return false }
    const item = customEquipment.find(entry => entry.id === character.equipment[index]) || getEquipment(character.equipment[index])
    if (!item) return false
    const value = Math.floor((Number(item.cost) || 0) / 2)
    if (!(await controllerConfirm(`Vender “${item.name}” por ${value} Zenits? Uma unidade será removida da mochila.`))) return false
    busyRef.current = true
    try {
      const success = await sellItem(item.id, index)
      if (!success) return false
      setSelectedBagIndex(current => current == null || character.equipment.length <= 1 ? null : Math.min(current, character.equipment.length - 2))
      return true
    } catch (reason) {
      controllerAlert(reason instanceof Error ? reason.message : 'Não foi possível vender o item.')
      return false
    } finally { busyRef.current = false }
  }

  // Captura o foco apenas enquanto a loja está aberta: comandos mapeados para
  // outras partes da campanha não executam por trás de uma compra/venda.
  useControllerActions({
    'ui.confirm': () => {
      const dialogs=[...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')]
        .filter(el=>{const rect=el.getBoundingClientRect();return rect.width>0&&rect.height>0})
      if (dialogs.at(-1) !== marketRef.current) return controllerFocus('ui.confirm')
      if (!marketRef.current?.contains(document.activeElement)) return focusVisibleCatalogCard()
      return controllerFocus('ui.confirm')
    },
    'ui.back': () => {
      // Uma imagem ampliada ou outro diálogo filho deve receber B primeiro.
      const dialogs=[...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')]
        .filter(el=>{const rect=el.getBoundingClientRect();return rect.width>0&&rect.height>0})
      if(dialogs.at(-1) !== marketRef.current) return controllerFocus('ui.back')
      if (selectedStoreItem) {
        const id = selectedStoreItem.id as string
        setSelectedStoreItem(null)
        requestAnimationFrame(()=>focusVisibleCatalogCard(id))
      } else onClose()
      return true
    },
    'ui.previous': () => focusAdjacentZone(-1),
    'ui.next': () => focusAdjacentZone(1),
    'ui.up': () => controllerFocus('ui.up'),
    'ui.down': () => controllerFocus('ui.down'),
    'ui.left': () => controllerFocus('ui.left'),
    'ui.right': () => controllerFocus('ui.right'),
    'store.buy': () => {void buySelected(); return true},
    'store.sell': () => {void sellSelectedAt(); return true},
    'store.category.previous': () => changeCategory(-1),
    'store.category.next': () => changeCategory(1),
    'store.folder.previous': () => changeFolder(-1),
    'store.folder.next': () => changeFolder(1),
    'store.zone.next': () => focusAdjacentZone(1),
    'ui.settings': () => false, // MENU ainda abre as preferências gerais.
  }, {enabled:isOpen, priority:350, captureAll:true})

  const weightStatus = inventoryStatus(character, customEquipment)
  const purchase = async (id: string) => {
    try {
      assertInventoryChange(
        character,
        { ...character, equipment: [...character.equipment, id] },
        customEquipment,
      )
      return await buyItem(id)
    } catch (e) {
      controllerAlert(e instanceof Error ? e.message : "Mochila sem capacidade.")
      return false
    }
  }
  const visibleFolders = normalizeStoreFolders(storeFolders).filter(folder => folder.isVisible)
  const [selectedFolderId, setActiveFolderId] = useState<string>("system")
  const activeFolderId = visibleFolders.some(folder => folder.id === selectedFolderId)
    ? selectedFolderId
    : visibleFolders[0]?.id || ""

  const getCategoryLabel = (cat: string) => {
    const labels: Record<string, string> = {
      weapon: "Arma",
      armor: "Armadura",
      shield: "Escudo",
      accessory: "Acessório",
      misc: "Diversos",
    }
    return labels[cat] || cat
  }

  // Filtragem dos itens com base na PASTA SELECIONADA
  const filteredStoreItems = useMemo(() => {
    if (!activeFolderId) return []
    let folderItems = []

    if (activeFolderId === "system") {
      folderItems = EQUIPMENT.map(
        (base) => customEquipment.find((item) => item.id === base.id) || base,
      )
    } else if (activeFolderId === "custom") {
      folderItems = customEquipment.filter(
        (item) => !item.folderId || item.folderId === "custom",
      )
    } else {
      folderItems = customEquipment.filter(
        (item) => item.folderId === activeFolderId,
      )
    }

    return folderItems.filter((item: any) => {
      // Itens marcados como não compráveis ficam ocultos da loja.
      if (item.purchasable === false) return false

      const matchesSearch =
        item.name.toLowerCase().includes(storeSearch.toLowerCase()) ||
        (item.detail &&
          item.detail.toLowerCase().includes(storeSearch.toLowerCase()))

      const matchesCategory =
        storeCategory === "all" || item.category === storeCategory

      return matchesSearch && matchesCategory
    })
  }, [activeFolderId, customEquipment, storeSearch, storeCategory])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black/95 backdrop-blur-lg"
          onClick={onClose}
        >
          <motion.div
            variants={modalVariants}
            ref={marketRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mercado e Forja"
            data-controller-layer={controllerActive ? 'active' : undefined}
            data-controller-store="active"
            className="rpg-modal relative flex h-[100dvh] w-screen max-w-none flex-col overflow-hidden border-0 bg-[#0b1116] shadow-2xl"
            data-controller-store-shortcuts={controllerActive ? 'active' : undefined}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header da Loja */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-accent/20 bg-gradient-to-r from-[#142934] via-[#101c23] to-[#0c1218] px-4 py-3 sm:px-7 sm:py-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent/10 border border-accent/20">
                  <Store className="size-6 md:size-7 text-accent" />
                </div>
                <div>
                  <h4 className="font-serif text-2xl font-black tracking-tight text-[#eee3cf] md:text-3xl">
                    Mercado & Forja
                  </h4>
                  <p className="text-[11px] font-medium text-amber-200/85 sm:text-xs">
                    Carga {formatWeight(weightStatus.grams)} / {formatWeight(weightStatus.capacityGrams)} · Livre {formatWeight(weightStatus.freeGrams)}
                  </p>
                  <p className="text-[10px] md:text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Equipamentos • Relíquias • Suprimentos
                  </p>
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:gap-3">
                <div className="flex items-center gap-2 bg-background px-4 py-2 rounded-full border border-accent/20 shadow-inner">
                  <Coins className="size-4 text-accent" />
                  <span className="font-mono font-bold text-sm md:text-base text-foreground">
                    {currentZenit} z
                  </span>
                </div>
                {/* A presença do controle ocupa espaço no cabeçalho. */}
                {controllerActive && <div id="store-controller-hud-slot" className="otms-store-controller-dock" aria-label="Status do controle no mercado" />}
                <button
                  onClick={onClose}
                  aria-label="Fechar Mercado e Forja"
                  className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <X className="size-5 text-muted-foreground hover:text-white" />
                </button>
              </div>
            </div>

            {controllerActive && <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-accent/20 bg-[#0e1c25] px-4 py-2.5 text-[11px] text-foreground/85 sm:px-7" aria-label="Comandos de controle do Mercado e Forja">
               <span className="font-bold uppercase tracking-[.14em] text-accent">Atalhos</span>
               <span className="inline-flex items-center gap-1.5"><ControllerGlyph button="X" small/> Comprar</span>
               <span className="inline-flex items-center gap-1.5"><ControllerGlyph button="Y" small/> Vender</span>
               <span className="inline-flex items-center gap-1.5"><ControllerGlyph button="LB" small/><ControllerGlyph button="RB" small/> Categorias</span>
               <span className="inline-flex items-center gap-1.5"><ControllerGlyph button="LT" small/><ControllerGlyph button="RT" small/> Pastas</span>
               <span className="inline-flex items-center gap-1.5"><ControllerGlyph button="VIEW" small/> Painéis</span>
               <span className="inline-flex items-center gap-1.5"><ControllerGlyph button="A" small/> Selecionar</span>
               <span className="inline-flex items-center gap-1.5"><ControllerGlyph button="B" small/> Voltar</span>
             </div>}

            {/* Corpo da Loja */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
              {/* Mochila (Sidebar Esquerda) */}
              <aside className="flex max-h-[22dvh] shrink-0 flex-col border-b border-white/10 bg-[#0e191f] lg:max-h-none lg:w-[250px] lg:border-b-0 lg:border-r xl:w-[292px]">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <h5 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      Sua Mochila
                    </h5>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Venda seus equipamentos
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {character.equipment.length} itens
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 custom-scrollbar-sepia">
                  {character.equipment.length === 0 ? (
                    <div className="h-full min-h-[120px] flex items-center justify-center">
                      <div className="text-center p-6">
                        <PackageOpen className="size-8 mx-auto text-muted-foreground/30 mb-2" />
                        <p className="text-xs text-muted-foreground italic">
                          Mochila vazia.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {character.equipment.map((id: string, index: number) => {
                        const item =
                          customEquipment.find((e: any) => e.id === id) ||
                          getEquipment(id)
                        if (!item) return null
                        const sellPrice = Math.floor(item.cost / 2)
                        return (
                          <div
                            key={`${id}-${index}`}
                            className={`group flex items-center gap-3 rounded-xl border p-3 transition-all ${selectedBagIndex === index ? "border-accent/60 bg-accent/10" : "border-border/40 bg-card/40 hover:border-accent/40 hover:bg-card"}`}
                          >
                             <div className="shrink-0">
                               <ItemArtwork name={item.name} imageUrl={item.imageUrl} className="size-9" fallback={<Package className="size-4 text-accent/70" />} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-xs text-foreground truncate">
                                {item.name}
                              </p>
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                {getCategoryLabel(item.category)} · {formatWeight(itemWeightGrams(item))}{item.consumable === true ? " · Consumível" : ""}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={!editable}
                              data-store-zone="bag"
                               data-store-item-index={index}
                               aria-label={`Vender ${item.name} por ${sellPrice} Zenits. Peso removido: ${formatWeight(itemWeightGrams(item))}`}
                               className="min-h-10 shrink-0 rounded-lg border border-accent/25 bg-accent/5 px-2.5 text-accent hover:bg-accent/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                               onFocus={() => setSelectedBagIndex(index)}
                               onClick={() => {setSelectedBagIndex(index); void sellSelectedAt(index)}}
                            >
                              {controllerActive && <ControllerGlyph button="Y" small/>} +{sellPrice}z
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </aside>

              {/* Área Principal (Filtros, Pastas e Vitrine) */}
              <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="flex shrink-0 flex-col gap-3 border-b border-accent/15 bg-[#11232b]/75 p-3 sm:p-4">
                  {/* PASTAS DA LOJA */}
                  <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar-sepia">
                    {visibleFolders.map((folder) => (
                      <button
                        key={folder.id}
                        data-store-zone="catalog"
                        aria-pressed={activeFolderId === folder.id}
                        aria-label={`Pasta ${folder.name}`}
                        onClick={() => {
                          setActiveFolderId(folder.id)
                          setSelectedStoreItem(null)
                        }}
                        className={`flex min-h-10 items-center gap-2 rounded-lg border px-4 py-2 text-xs font-bold whitespace-nowrap transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${activeFolderId === folder.id ? "bg-accent/20 text-accent border-accent/50 shadow-inner" : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-foreground"}`}
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
                      <input
                        type="text"
                        data-store-zone="catalog"
                        aria-label="Pesquisar itens do mercado"
                        value={storeSearch}
                        onChange={(e) => setStoreSearch(e.target.value)}
                        placeholder="Pesquisar nesta pasta..."
                        className="w-full h-10 pl-10 pr-4 rounded-lg bg-background border border-border focus:border-accent/60 focus:outline-none text-sm"
                      />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar-sepia">
                      {STORE_CATEGORIES.map(([id, label]) => (
                        <button
                          key={id}
                          data-store-zone="catalog"
                          aria-pressed={storeCategory === id}
                          onClick={() => { setStoreCategory(id); setSelectedStoreItem(null) }}
                          className={`min-h-10 rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${storeCategory === id ? "bg-accent text-accent-foreground border-accent" : "bg-white/5 text-muted-foreground border-white/10 hover:border-accent/30 hover:text-foreground"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 custom-scrollbar-sepia sm:p-5">
                  <div className="mb-4 flex items-end justify-between">
                    <div>
                      <h5 className="font-serif text-lg font-bold text-foreground">
                        Vitrine
                      </h5>
                      <p className="text-xs text-muted-foreground">
                        Selecione um item para examinar seus detalhes.
                      </p>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {filteredStoreItems.length} resultados
                    </span>
                  </div>

                  {filteredStoreItems.length === 0 ? (
                    <div className="h-48 flex flex-col items-center justify-center text-center">
                      <SearchX className="size-8 text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nenhum item encontrado nesta pasta/filtro.
                      </p>
                      <button
                        data-store-zone="catalog"
                        onClick={() => {
                          setStoreSearch("")
                          setStoreCategory("all")
                        }}
                        className="mt-2 text-xs text-accent hover:underline"
                      >
                        Limpar filtros
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {filteredStoreItems.map((item: any) => {
                        const canAfford = currentZenit >= item.cost
                        const selected = selectedStoreItem?.id === item.id
                        return (
                          <motion.button
                            layout
                            key={item.id}
                            data-store-zone="catalog"
                            data-store-card="true"
                            data-store-item-id={item.id}
                            aria-pressed={selected}
                            aria-label={`Examinar ${item.name}, custo ${item.cost} Zenits, peso ${formatWeight(itemWeightGrams(item))}`}
                            onClick={(event) => {
                              setSelectedStoreItem(item)
                              // No controle, A entra na inspeção; um clique de mouse
                              // apenas seleciona o cartão, como já fazia antes.
                              if (controllerActive && event.detail === 0)
                                requestAnimationFrame(()=>focusZone('inspect'))
                            }}
                            className={`group relative min-h-[160px] rounded-xl border p-4 text-left transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selected ? "border-accent bg-accent/10 shadow-lg shadow-accent/5" : canAfford ? "border-border/60 bg-card/50 hover:border-accent/40 hover:bg-card" : "border-destructive/20 bg-destructive/5 opacity-60"}`}
                          >
                            <div className="absolute top-3 right-3">
                              <div
                                className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-mono font-bold ${canAfford ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive"}`}
                              >
                                <Coins className="size-3" /> {item.cost}z
                              </div>
                            </div>
                             {itemImageUrl(item.imageUrl) ? <div className="mb-4"><ItemArtwork name={item.name} imageUrl={item.imageUrl} className="size-20" /></div> : <div className="size-14 mb-4 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center group-hover:border-accent/30 transition-colors">
                              {item.category === "weapon" && (
                                <Sword className="size-7 text-accent/70" />
                              )}
                              {item.category === "armor" && (
                                <Shield className="size-7 text-accent/70" />
                              )}
                              {item.category === "shield" && (
                                <Shield className="size-7 text-accent/70" />
                              )}
                              {item.category === "accessory" && (
                                <Gem className="size-7 text-accent/70" />
                              )}
                              {item.category === "misc" && <Package className="size-7 text-accent/70" />}
                             </div>}
                             <div className="pr-16">
                              <p className="font-bold text-sm text-foreground">
                                {item.name}
                              </p>
                              <p className="mt-1 text-[9px] uppercase tracking-widest text-accent/70">
                                {getCategoryLabel(item.category)}{item.consumable === true ? " · Consumível" : ""}
                              </p>
                            </div>
                             <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
                               <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary"><Scale className="size-3.5"/> {formatWeight(itemWeightGrams(item))}</span>
                               <span className="text-[10px] text-muted-foreground">Examinar</span>
                              <Eye className="size-3.5 text-muted-foreground group-hover:text-accent transition-colors" />
                            </div>
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
                  <motion.aside
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex max-h-[38dvh] w-full shrink-0 flex-col overflow-hidden border-t border-white/10 bg-[#0d1b22] lg:max-h-none lg:w-[340px] lg:border-l lg:border-t-0 xl:w-[380px]"
                  >
                    <div className="p-5 border-b border-white/10">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <p className="text-[9px] uppercase tracking-[0.2em] text-accent mb-1">
                            Inspecionando
                          </p>
                          <h5 className="font-serif text-xl font-bold text-foreground">
                             {selectedStoreItem.name}
                          </h5>
                        </div>
                        <button
                          onClick={() => setSelectedStoreItem(null)}
                          data-store-zone="inspect"
                          aria-label="Voltar à vitrine"
                          className="p-1.5 rounded-md hover:bg-white/10"
                        >
                          <X className="size-4 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                    <div className="p-6">
                       {itemImageUrl(selectedStoreItem.imageUrl) ? (
                         <div className="flex flex-col items-center gap-2">
                           <ItemArtwork name={selectedStoreItem.name} imageUrl={selectedStoreItem.imageUrl} expandable className="h-48 w-full max-w-[280px]" />
                           <span className="text-[10px] text-muted-foreground">Clique para ampliar a imagem</span>
                         </div>
                       ) : <div className="aspect-square max-h-[180px] rounded-xl bg-gradient-to-br from-accent/10 via-black/30 to-black/60 border border-accent/20 flex items-center justify-center">
                        {selectedStoreItem.category === "weapon" && (
                          <Sword className="size-24 text-accent/40" />
                        )}
                        {selectedStoreItem.category === "armor" && (
                          <Shield className="size-24 text-accent/40" />
                        )}
                        {selectedStoreItem.category === "shield" && (
                          <Shield className="size-24 text-accent/40" />
                        )}
                        {selectedStoreItem.category === "accessory" && (
                          <Gem className="size-24 text-accent/40" />
                        )}
                        {selectedStoreItem.category === "misc" && <Package className="size-24 text-accent/40" />}
                       </div>}
                     </div>
                     <div className="flex-1 overflow-y-auto px-5 pb-5 custom-scrollbar-sepia">
                      <div className="space-y-5">
                        <div>
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                            Descrição
                          </p>
                          <div className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                            {selectedStoreItem.detail}
                          </div>
                        </div>
                         <div className="grid grid-cols-3 gap-2">
                          <div className="p-3 rounded-lg bg-card border border-border/50">
                            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                              Categoria
                            </p>
                            <p className="mt-1 text-xs font-bold text-foreground">
                              {getCategoryLabel(selectedStoreItem.category)}
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-card border border-border/50">
                            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                              Valor
                            </p>
                            <p className="mt-1 text-xs font-bold text-accent font-mono">
                              {selectedStoreItem.cost} z
                            </p>
                          </div>
                           <div className="rounded-lg border border-primary/25 bg-primary/10 p-3">
                             <p className="text-[9px] uppercase tracking-widest text-primary/80">Peso por unidade</p>
                             <p className="mt-1 text-xs font-bold text-primary">{formatWeight(itemWeightGrams(selectedStoreItem))}</p>
                           </div>
                         </div>
                       </div>
                     </div>
                     <div className="border-t border-white/10 bg-black/30 p-3 sm:p-4">
                      {currentZenit >= selectedStoreItem.cost ? (
                        <Button
                          disabled={!editable}
                          data-store-zone="inspect"
                          data-store-buy="true"
                           onClick={() => void buySelected()}
                          className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 font-bold"
                        >
                          <ShoppingCart className="size-4 mr-2" /> Comprar por {selectedStoreItem.cost} z
                          {controllerActive && <span className="ml-auto"><ControllerGlyph button="X" small/></span>}
                        </Button>
                      ) : (
                        <div className="text-center p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                          <p className="text-xs font-bold text-destructive">
                            Zenit insuficiente
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Faltam {selectedStoreItem.cost - currentZenit} z
                          </p>
                        </div>
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
