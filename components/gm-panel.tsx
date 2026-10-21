"use client"
import { normalizeStoreFolders } from "@/lib/store-folders"
import { ClassBooksWorkbench } from "./class-books"
import { CustomChecksWorkbench } from "./custom-checks-workbench"
import type { CustomCheck } from "@/lib/custom-checks"
import { getCampaignClassCatalog } from "@/lib/class-catalog"
import { isClassPublished, type CustomClassVisibility } from "@/lib/class-visibility"
import { CLASSES } from "@/lib/game-data"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  X,
  Gift,
  Search,
  ChevronDown,
  Package,
  Info,
  Coins,
  Loader2,
  Send,
  Sword,
  Shield,
  Gem,
  Plus,
  Save,
  Trash2,
  GraduationCap,
  Heart,
  Zap,
  Dices,
  FolderOpen,
  FolderPlus,
  EyeOff,
  Eye,
  ArrowRightLeft,
  Sparkles,
  Check,
  Pencil,
  LayoutGrid,
  List,
  ArrowUpDown,
  CheckCircle2,
} from "lucide-react"

import { ItemWeightField } from "./item-weight-field"
import { weightFields, type ItemWeight } from "@/lib/inventory-weight"
import { ItemActionsEditor } from "./inventory-equipment"
import { ItemArtwork } from "./item-artwork"
import { itemImageUrl, validateItemImageUrl } from "@/lib/item-image"
import { getItemActions, validateItemAction } from "@/lib/item-mechanics"
import { Button } from "@/components/ui/button"
import { CharacterPortrait } from "@/components/character-portrait"
import {
  EQUIPMENT,
  GameClass,
  GameSkill,
  GameSkillBonus,
} from "@/lib/game-data"
import type { Character, ActiveCreature, CustomItem } from "@/lib/types"
import { GMHazardPanel, HazardData } from "./condition-manager"
import type { StoreFolder } from "@/lib/types"

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

export interface Member {
  userId: string
  role?: string
  name: string
}

interface GmPanelProps {
  campaignId: string
  booksRevision?: number
  customChecks: CustomCheck[]
  customChecksRevision: number
  onRefreshCustomChecks: () => Promise<void>
  isOpen: boolean
  onClose: () => void
  characters: Character[]
  activeCreatures: ActiveCreature[]
  members: Member[]
  customEquipment: any[]
  customClasses: any[]
  onCreateEquipment: (eq: any) => void | Promise<void>
  onDeleteEquipment: (id: string) => void
  onCreateClass: (cls: GameClass) => void | Promise<void>
  onDeleteClass: (id: string) => void
  onGiveZenits: (targetId: string, amount: number) => Promise<void>
  onGiveCustomItem: (
    targetId: string,
    name: string,
    type: string,
    content: string,
    weight?: ItemWeight,
  ) => Promise<void>
  onGiveSystemItem: (targetId: string, itemId: string) => Promise<void>
  storeFolders: StoreFolder[]
  onCreateFolder: (folder: StoreFolder) => void
  onUpdateFolder: (id: string, updates: Partial<StoreFolder>) => void
  onDeleteFolder: (id: string) => void
  onMoveCustomItem: (itemId: string, folderId: string) => void

  activeHazards: HazardData[]

  onLaunchHazard: (
    type: "oxygen" | "bleeding" | "reaction",
    minutes: number,
    targetCharacterIds: string[] | null,
  ) => void

  onStopHazard: (
    type: "oxygen" | "bleeding" | "reaction",
    targetCharacterIds: string[] | null,
  ) => void
}

function SkillForgeCard({
  skill,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
  setClassDraft,
}: {
  skill: GameSkill
  expanded: boolean
  onToggle: () => void
  onUpdate: (updates: Partial<GameSkill>) => void
  onRemove: () => void
  setClassDraft: React.Dispatch<React.SetStateAction<GameClass>>
}) {
  const levels = Array.from({ length: skill.maxLevel }, (_, index) => index + 1)

  function toggleSkillAction(skillId: string) {
    setClassDraft((prev) => ({
      ...prev,
      skills: prev.skills.map((skill) => {
        if (skill.id !== skillId) return skill

        return {
          ...skill,
          action: skill.action
            ? undefined
            : {
              cost: 5,
              resource: "mp",
            },
        }
      }),
    }))
  }

  function updateSkillAction(
    skillId: string,
    updates: Partial<NonNullable<GameSkill["action"]>>,
  ) {
    setClassDraft((prev) => ({
      ...prev,
      skills: prev.skills.map((skill) =>
        skill.id === skillId
          ? {
            ...skill,
            action: skill.action
              ? {
                ...skill.action,
                ...updates,
              }
              : {
                cost: 0,
                resource: "mp",
                ...updates,
              },
          }
          : skill,
      ),
    }))
  }

  function addSkillBonus(skillId: string, level: number) {
    const bonus = createBonusDraft()

    setClassDraft((prev) => ({
      ...prev,
      skills: prev.skills.map((skill) => {
        if (skill.id !== skillId) return skill

        const bonuses = {
          ...(skill.bonuses || {}),
        }

        bonuses[level] = [...(bonuses[level] || []), bonus]

        return {
          ...skill,
          bonuses,
        }
      }),
    }))
  }

  function updateSkillBonus(
    skillId: string,
    level: number,
    bonusId: string,
    updates: Partial<GameSkillBonus>,
  ) {
    setClassDraft((prev) => ({
      ...prev,
      skills: prev.skills.map((skill) => {
        if (skill.id !== skillId) return skill

        const bonuses = {
          ...(skill.bonuses || {}),
        }

        bonuses[level] = (bonuses[level] || []).map((bonus) =>
          bonus.id === bonusId ? { ...bonus, ...updates } : bonus,
        )

        return {
          ...skill,
          bonuses,
        }
      }),
    }))
  }

  function removeSkillBonus(skillId: string, level: number, bonusId: string) {
    setClassDraft((prev) => ({
      ...prev,
      skills: prev.skills.map((skill) => {
        if (skill.id !== skillId) return skill

        const bonuses = {
          ...(skill.bonuses || {}),
        }

        bonuses[level] = (bonuses[level] || []).filter(
          (bonus) => bonus.id !== bonusId,
        )

        if (bonuses[level].length === 0) {
          delete bonuses[level]
        }

        return {
          ...skill,
          bonuses,
        }
      }),
    }))
  }

  return (
    <div
      className={`
        rounded-xl border overflow-hidden transition-all
        ${expanded
          ? "border-amber-600/40 bg-amber-600/[0.04]"
          : "border-border/60 bg-foreground/[0.03] hover:border-white/15"
        }
      `}
    >
      {/* HEADER */}
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-3 text-left"
        >
          <div className="size-9 rounded-lg bg-amber-600/10 border border-amber-600/20 flex items-center justify-center shrink-0">
            <GraduationCap className="size-4 text-amber-500" />
          </div>

          <div className="min-w-0">
            <div className="font-bold text-sm text-foreground truncate">
              {skill.name || "Nova Habilidade"}
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Máx. Nv. {skill.maxLevel}
              </span>

              {skill.action && (
                <span className="text-[9px] uppercase tracking-widest text-blue-400">
                  • Ação
                </span>
              )}

              {skill.bonuses && Object.keys(skill.bonuses).length > 0 && (
                <span className="text-[9px] uppercase tracking-widest text-purple-400">
                  • Bônus
                </span>
              )}
            </div>
          </div>

          <ChevronDown
            className={`
              size-4 text-muted-foreground transition-transform
              ${expanded ? "rotate-180 text-amber-500" : ""}
            `}
          />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Remover habilidade"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 1 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-4 pt-1 border-t border-border/60 space-y-4">
              {/* DADOS BÁSICOS */}
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-amber-500">
                    Nome
                  </span>

                  <input
                    value={skill.name}
                    onChange={(e) => onUpdate({ name: e.target.value })}
                    placeholder="Ex: Golpe Sombrio"
                    className="bg-background/80 border border-border/80 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-600/50"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-amber-500">
                    Máx. Nível
                  </span>

                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={skill.maxLevel}
                    onChange={(e) =>
                      onUpdate({
                        maxLevel: Math.max(1, Number(e.target.value)),
                      })
                    }
                    className="bg-background/80 border border-border/80 rounded-lg px-3 py-2 text-sm font-mono text-center outline-none focus:border-amber-600/50"
                  />
                </label>
              </div>

              {/* DESCRIÇÃO */}
              <label className="flex flex-col gap-1.5">
                <span className="text-[9px] uppercase tracking-widest font-bold text-amber-500">
                  Descrição / Regra
                </span>

                <textarea
                  value={skill.description}
                  onChange={(e) =>
                    onUpdate({
                      description: e.target.value,
                    })
                  }
                  rows={4}
                  placeholder="Descreva exatamente o funcionamento da habilidade..."
                  className="bg-background/80 border border-border/80 rounded-lg px-3 py-2 text-xs leading-relaxed resize-none outline-none focus:border-amber-600/50"
                />

                <span className="text-[9px] text-muted-foreground">
                  Você pode usar [Nível da Perícia] e outras fórmulas utilizadas
                  pelas classes oficiais.
                </span>
              </label>

              {/* AÇÃO */}
              <div className="rounded-xl border border-blue-500/15 bg-blue-500/[0.03] overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSkillAction(skill.id)}
                  className="w-full flex items-center justify-between p-3"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="size-4 text-blue-400" />

                    <div className="text-left">
                      <div className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                        Ação / Custo
                      </div>

                      <div className="text-[10px] text-muted-foreground">
                        Permite configurar um custo como nas classes oficiais.
                      </div>
                    </div>
                  </div>

                  <div
                    className={`
                      size-5 rounded-full border flex items-center justify-center
                      ${skill.action
                        ? "border-blue-400 bg-blue-400"
                        : "border-border"
                      }
                    `}
                  >
                    {skill.action && <Check className="size-3 text-black" />}
                  </div>
                </button>

                {skill.action && (
                  <div className="grid grid-cols-2 gap-3 p-3 pt-0">
                    <label className="flex flex-col gap-1">
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                        Custo
                      </span>

                      <input
                        type="number"
                        min={0}
                        value={skill.action.cost}
                        onChange={(e) =>
                          onUpdate({
                            action: {
                              ...skill.action!,
                              cost: Number(e.target.value),
                            },
                          })
                        }
                        className="bg-background/80 border border-border/80 rounded-lg px-3 py-2 text-sm font-mono outline-none"
                      />
                    </label>

                    <label className="flex flex-col gap-1">
                      <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                        Recurso
                      </span>

                      <select
                        value={skill.action.resource}
                        onChange={(e) =>
                          onUpdate({
                            action: {
                              ...skill.action!,
                              resource: e.target.value as "mp" | "hp" | "ip",
                            },
                          })
                        }
                        className="bg-background/80 border border-border/80 rounded-lg px-3 py-2 text-sm outline-none"
                      >
                        <option value="mp">PM — Pontos de Mente</option>
                        <option value="hp">PV — Pontos de Vida</option>
                        <option value="ip">PI — Pontos de Inventário</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>

              {/* BÔNUS */}
              <div className="rounded-xl border border-purple-500/15 bg-purple-500/[0.03] overflow-hidden">
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-purple-400" />

                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                        Bônus por Nível
                      </div>

                      <div className="text-[10px] text-muted-foreground">
                        Crie escolhas como Mutação ou aprimoramentos como
                        Simbiose.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-3 pb-3 space-y-2">
                  {levels.map((level) => {
                    const bonuses = skill.bonuses?.[level] || []

                    return (
                      <div
                        key={level}
                        className="rounded-lg border border-border/60 bg-foreground/[0.025]"
                      >
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">
                            Nível {level}
                          </span>

                          <button
                            type="button"
                            onClick={() => {
                              const bonus = createBonusDraft()

                              onUpdate({
                                bonuses: {
                                  ...(skill.bonuses || {}),
                                  [level]: [...bonuses, bonus],
                                },
                              })
                            }}
                            className="text-[9px] font-bold uppercase tracking-wider text-purple-400 hover:text-purple-300"
                          >
                            + Opção
                          </button>
                        </div>

                        {bonuses.length > 0 && (
                          <div className="p-2 pt-0 space-y-2">
                            {bonuses.map((bonus) => (
                              <div
                                key={bonus.id}
                                className="relative rounded-lg border border-purple-500/10 bg-background/80 p-3 space-y-2"
                              >
                                <div className="flex gap-2">
                                  <input
                                    value={bonus.name}
                                    onChange={(e) => {
                                      const next = {
                                        ...(skill.bonuses || {}),
                                      }

                                      next[level] = bonuses.map((item) =>
                                        item.id === bonus.id
                                          ? {
                                            ...item,
                                            name: e.target.value,
                                          }
                                          : item,
                                      )

                                      onUpdate({
                                        bonuses: next,
                                      })
                                    }}
                                    placeholder="Nome da opção"
                                    className="flex-1 bg-foreground/[0.045] border border-border/80 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-purple-500/40"
                                  />

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = {
                                        ...(skill.bonuses || {}),
                                      }

                                      next[level] = bonuses.filter(
                                        (item) => item.id !== bonus.id,
                                      )

                                      if (next[level].length === 0) {
                                        delete next[level]
                                      }

                                      onUpdate({
                                        bonuses: next,
                                      })
                                    }}
                                    className="p-1.5 text-muted-foreground hover:text-red-400"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>

                                <textarea
                                  value={bonus.description}
                                  onChange={(e) => {
                                    const next = {
                                      ...(skill.bonuses || {}),
                                    }

                                    next[level] = bonuses.map((item) =>
                                      item.id === bonus.id
                                        ? {
                                          ...item,
                                          description: e.target.value,
                                        }
                                        : item,
                                    )

                                    onUpdate({
                                      bonuses: next,
                                    })
                                  }}
                                  rows={2}
                                  placeholder="O que esta opção concede?"
                                  className="w-full bg-foreground/[0.045] border border-border/80 rounded px-2 py-1.5 text-[11px] resize-none outline-none focus:border-purple-500/40"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function createBonusDraft(): GameSkillBonus {
  return {
    id: `bonus-${Math.random().toString(36).substring(2, 9)}`,
    name: "",
    description: "",
  }
}

export function GmPanel({
  campaignId,
  booksRevision = 0,
  customChecks,
  customChecksRevision,
  onRefreshCustomChecks,
  isOpen,
  onClose,
  characters,
  activeCreatures,
  members,
  customEquipment,
  customClasses,
  onCreateEquipment,
  onDeleteEquipment,
  onCreateClass,
  onDeleteClass,
  onGiveZenits,
  onGiveCustomItem,
  onGiveSystemItem,

  // Pastas da loja
  storeFolders,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onMoveCustomItem,

  activeHazards,
  onLaunchHazard,
  onStopHazard,
}: GmPanelProps) {
  const [gmPanelTab, setGmPanelTab] = useState<
    "catalog" | "custom" | "zenits" | "classes" | "hazards" | "store-config" | "checks"
  >("catalog")
  const [zenitAmount, setZenitAmount] = useState<number | "">("")
  const [selectedLoot, setSelectedLoot] = useState<string | null>(null)
  const [selectedTargetCharId, setSelectedTargetCharId] = useState<
    string | null
  >(null)
  const [sendingLoot, setSendingLoot] = useState(false)
  const [lootSearchQuery, setLootSearchQuery] = useState("")
  // Estado apenas de apresentação do catálogo. Nenhuma mudança nos itens persistidos.
  const [catalogCategory, setCatalogCategory] = useState("all")
  const [catalogSource, setCatalogSource] = useState("all")
  const [catalogSort, setCatalogSort] = useState("default")
  const [catalogView, setCatalogView] = useState<"grid" | "list">("grid")
  const [newFolderName, setNewFolderName] = useState("")
  // Filtros locais da interface de organização; não alteram os dados da loja.
  const [storeItemSearch, setStoreItemSearch] = useState("")
  const [storeFolderFilter, setStoreFolderFilter] = useState("all")

  // Rascunho Relíquias
  const [customItemName, setCustomItemName] = useState("")
  const [customItemType, setCustomItemType] = useState<
    "text" | "image" | "video" | "app-blueprints"
  >("text")
  const [customWeight, setCustomWeight] = useState<ItemWeight>({
    weight: 100,
    weightUnit: "g",
  })
  const [customItemContent, setCustomItemContent] = useState("")

  // Rascunho Equipamentos de Sistema
  const [creationMode, setCreationMode] = useState<"relic" | "system">("system")
  const [sysDraft, setSysDraft] = useState<any>({
    name: "",
    category: "weapon",
    consumable: false,
    imageUrl: "",
    cost: 100,
    purchasable: true,
    detail: "",
    damage: "",
    defense: "",
    mdef: "",
    type: "",
    bonus: "",
    effect: "",
    actions: [],
  })

  // Rascunho de Classe (Homebrew)
  const createSkillDraft = (): GameSkill => ({
    id: `sk-${Math.random().toString(36).substring(2, 9)}`,
    name: "",
    maxLevel: 5,
    description: "",
  })

  const createBonusDraft = (): GameSkillBonus => ({
    id: `bonus-${Math.random().toString(36).substring(2, 9)}`,
    name: "",
    description: "",
  })

  const [classDraft, setClassDraft] = useState<CustomClassVisibility>({
    id: "",
    playerVisible: false,
    name: "",
    archetype: "",
    description: "",
    hpPerLevel: 5,
    mpPerLevel: 5,
    primaryAttribute: "mig",
    skills: [createSkillDraft()],
  })

  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null)

  // Estado para expandir os detalhes da classe homebrew
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null)
  const [savingClass, setSavingClass] = useState(false)
  const [publishingClassId, setPublishingClassId] = useState<string | null>(null)

  async function changeClassVisibility(cls: GameClass) {
    if (publishingClassId) return
    setPublishingClassId(cls.id)
    try {
      await onCreateClass({ ...cls, playerVisible: !isClassPublished(cls) } as CustomClassVisibility)
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível alterar a publicação da classe.")
    } finally {
      setPublishingClassId(null)
    }
  }

  const allFolders = normalizeStoreFolders(storeFolders)

  // Função para criar pasta
  function handleCreateFolder() {
    if (!newFolderName.trim()) return alert("Dê um nome para a pasta.")
    onCreateFolder({
      id: "folder-" + Math.random().toString(36).substring(2, 9),
      name: newFolderName,
      isVisible: true,
      isSystem: false,
    })
    setNewFolderName("")
  }

  const allLoot = [...customEquipment, ...EQUIPMENT]
  const catalogCategories = [
    { id: "all", label: "Todos", icon: LayoutGrid },
    { id: "weapon", label: "Armas", icon: Sword },
    { id: "armor", label: "Armaduras", icon: Shield },
    { id: "shield", label: "Escudos", icon: Shield },
    { id: "accessory", label: "Acessórios", icon: Gem },
    { id: "misc", label: "Diversos", icon: Package },
  ] as const
  const catalogCategoryName: Record<string, string> = {
    weapon: "Arma", armor: "Armadura", shield: "Escudo",
    accessory: "Acessório", misc: "Diversos",
  }
  const filteredLoot = allLoot
    .filter((item) => {
      const query = lootSearchQuery.trim().toLocaleLowerCase("pt-BR")
      const matchesSearch = !query || [item.name, item.detail, item.type]
        .some((text) => String(text ?? "").toLocaleLowerCase("pt-BR").includes(query))
      const isCustom = String(item.id).startsWith("custom-eq-")
      const matchesSource = catalogSource === "all" || (catalogSource === "custom" ? isCustom : !isCustom)
      return matchesSearch && matchesSource && (catalogCategory === "all" || item.category === catalogCategory)
    })
    .sort((a, b) => {
      if (catalogSort === "name") return String(a.name).localeCompare(String(b.name), "pt-BR")
      if (catalogSort === "price-asc") return Number(a.cost ?? 0) - Number(b.cost ?? 0)
      if (catalogSort === "price-desc") return Number(b.cost ?? 0) - Number(a.cost ?? 0)
      return 0 // A ordem original continua como visualização padrão.
    })
  const selectedCatalogItem = allLoot.find((item) => item.id === selectedLoot)
  const customCatalogCount = customEquipment.length

  function resetCatalogFilters() {
    setLootSearchQuery("")
    setCatalogCategory("all")
    setCatalogSource("all")
    setCatalogSort("default")
  }

  function CreatedClassCard({
    cls,
    expanded,
    onToggle,
    onDelete,
    onEdit,
  }: {
    cls: GameClass
    expanded: boolean
    onToggle: () => void
    onDelete: () => void
    onEdit: () => void
  }) {
    const attributeLabels: Record<GameClass["primaryAttribute"], string> = {
      mig: "Vigor (MIG)",
      dex: "Destreza (DEX)",
      ins: "Intuição (INS)",
      wlp: "Vontade (WLP)",
    }

    return (
      <div
        className={`
        rounded-2xl border overflow-hidden transition-all
        ${expanded
            ? "border-amber-500/40 bg-amber-500/[0.04]"
            : "border-border/80 bg-foreground/[0.03] hover:border-border"
          }
      `}
      >
        {/* CABEÇALHO */}
        <div className="flex items-center gap-3 p-4">
          <button
            type="button"
            onClick={onToggle}
            className="flex-1 min-w-0 flex items-center gap-3 text-left"
          >
            <div className="size-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <GraduationCap className="size-5 text-amber-500" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-serif font-black text-base text-foreground truncate">
                  {cls.name}
                </h4>

                <span className="text-[8px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 shrink-0">
                  {cls.parentClassId ? "Subclasse" : "Homebrew"}
                </span>
                <span className={`text-[8px] uppercase tracking-widest px-2 py-0.5 rounded-full border ${isClassPublished(cls) ? "border-green-500/30 text-green-300" : "border-orange-500/30 text-orange-300"}`}>
                  {isClassPublished(cls) ? "Liberada" : "Oculta"}
                </span>
              </div>

              <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5 truncate">
                {cls.archetype}
              </p>

              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[9px] font-mono px-2 py-1 rounded bg-red-500/10 text-red-300 border border-red-500/10">
                  {cls.hpPerLevel} PV/Nv
                </span>

                <span className="text-[9px] font-mono px-2 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/10">
                  {cls.mpPerLevel} PM/Nv
                </span>

                <span className="text-[9px] px-2 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/10">
                  {attributeLabels[cls.primaryAttribute]}
                </span>

                <span className="text-[9px] px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/10">
                  {cls.skills.length} perícia
                  {cls.skills.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <ChevronDown
              className={`
              size-4 text-muted-foreground shrink-0 transition-transform
              ${expanded ? "rotate-180 text-amber-500" : ""}
            `}
            />
          </button>

          <button
            type="button"
            disabled={publishingClassId !== null}
            onClick={() => void changeClassVisibility(cls)}
            title={isClassPublished(cls) ? "Ocultar dos jogadores" : "Liberar aos jogadores"}
            aria-label={`${isClassPublished(cls) ? "Ocultar" : "Liberar"} ${cls.name} para evolução`}
            className={`rounded-md border p-2 text-xs font-bold disabled:opacity-50 ${isClassPublished(cls)
              ? "border-green-600/40 text-green-300 hover:bg-green-700/10"
              : "border-orange-500/40 text-orange-300 hover:bg-orange-700/10"}`}
          >
            {isClassPublished(cls) ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </button>
          <button type="button" onClick={onEdit} title="Editar classe ou subclasse" className="p-2 rounded-lg text-amber-300 hover:bg-amber-500/10"><Pencil className="size-4" /></button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()

              if (
                confirm(
                  `Excluir a classe "${cls.name}"? Esta ação não pode ser desfeita.`,
                )
              ) {
                onDelete()
              }
            }}
            className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Excluir classe"
          >
            <Trash2 className="size-4" />
          </button>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="border-t border-border/60 p-4 space-y-5">
                {/* IDENTIDADE */}
                <div className="rounded-xl border border-amber-500/10 bg-amber-500/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="size-4 text-amber-500" />

                    <span className="text-[10px] uppercase tracking-widest font-black text-amber-500">
                      Identidade da Classe
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                    {cls.description || "Sem descrição."}
                  </p>
                </div>

                {/* ATRIBUTOS */}
                <div>
                  <div className="text-[9px] uppercase tracking-widest font-black text-muted-foreground mb-2">
                    Progressão
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-red-500/10 bg-red-500/[0.03] p-3">
                      <div className="text-[8px] uppercase tracking-widest text-red-400">
                        Vida
                      </div>
                      <div className="font-mono font-bold text-sm mt-1">
                        +{cls.hpPerLevel} PV
                      </div>
                      <div className="text-[8px] text-muted-foreground">
                        por nível
                      </div>
                    </div>

                    <div className="rounded-lg border border-blue-500/10 bg-blue-500/[0.03] p-3">
                      <div className="text-[8px] uppercase tracking-widest text-blue-400">
                        Mente
                      </div>
                      <div className="font-mono font-bold text-sm mt-1">
                        +{cls.mpPerLevel} PM
                      </div>
                      <div className="text-[8px] text-muted-foreground">
                        por nível
                      </div>
                    </div>

                    <div className="rounded-lg border border-purple-500/10 bg-purple-500/[0.03] p-3">
                      <div className="text-[8px] uppercase tracking-widest text-purple-400">
                        Atributo
                      </div>
                      <div className="font-bold text-sm mt-1">
                        {cls.primaryAttribute.toUpperCase()}
                      </div>
                      <div className="text-[8px] text-muted-foreground">
                        {attributeLabels[cls.primaryAttribute]}
                      </div>
                    </div>
                  </div>
                </div>

                {/* HABILIDADES */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-[9px] uppercase tracking-widest font-black text-amber-500">
                        Habilidades
                      </div>

                      <div className="text-[9px] text-muted-foreground mt-0.5">
                        Todas as regras configuradas para esta classe
                      </div>
                    </div>

                    <span className="text-[9px] font-mono text-muted-foreground">
                      {cls.skills.length} total
                    </span>
                  </div>

                  <div className="space-y-2">
                    {cls.skills.map((skill, index) => (
                      <div
                        key={skill.id || index}
                        className="rounded-xl border border-border/60 bg-foreground/[0.03] overflow-hidden"
                      >
                        {/* SKILL HEADER */}
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="size-6 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center text-[9px] font-black">
                                  {index + 1}
                                </span>

                                <h5 className="font-bold text-sm truncate">
                                  {skill.name || "Habilidade sem nome"}
                                </h5>
                              </div>
                            </div>

                            <div className="flex gap-1.5 shrink-0">
                              <span className="text-[8px] font-mono px-2 py-1 rounded bg-foreground/[0.045] text-muted-foreground">
                                Máx. Nv. {skill.maxLevel}
                              </span>

                              {skill.action && (
                                <span className="text-[8px] px-2 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/10 flex items-center gap-1">
                                  <Zap className="size-2.5" />
                                  Ação
                                </span>
                              )}

                              {skill.bonuses &&
                                Object.keys(skill.bonuses).length > 0 && (
                                  <span className="text-[8px] px-2 py-1 rounded bg-purple-500/10 text-purple-300 border border-purple-500/10 flex items-center gap-1">
                                    <Sparkles className="size-2.5" />
                                    Bônus
                                  </span>
                                )}
                            </div>
                          </div>

                          {/* DESCRIÇÃO */}
                          <div className="mt-3 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {skill.description || "Sem descrição."}
                          </div>

                          {/* AÇÃO */}
                          {skill.action && (
                            <div className="mt-3 rounded-lg border border-blue-500/10 bg-blue-500/[0.03] p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <Zap className="size-3.5 text-blue-400" />

                                <span className="text-[9px] uppercase tracking-widest font-black text-blue-400">
                                  Custo de Ação
                                </span>
                              </div>

                              <div className="flex gap-2">
                                <span className="text-[10px] font-mono px-2 py-1 rounded bg-blue-500/10 text-blue-200">
                                  {skill.action.cost}
                                </span>

                                <span className="text-[10px] uppercase px-2 py-1 rounded bg-foreground/[0.045] text-muted-foreground">
                                  {skill.action.resource === "mp"
                                    ? "PM — Pontos de Mente"
                                    : skill.action.resource === "hp"
                                      ? "PV — Pontos de Vida"
                                      : "PI — Pontos de Inventário"}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* BÔNUS */}
                          {skill.bonuses &&
                            Object.keys(skill.bonuses).length > 0 && (
                              <div className="mt-3 rounded-lg border border-purple-500/10 bg-purple-500/[0.03] p-3">
                                <div className="flex items-center gap-2 mb-3">
                                  <Sparkles className="size-3.5 text-purple-400" />

                                  <span className="text-[9px] uppercase tracking-widest font-black text-purple-400">
                                    Bônus por Nível
                                  </span>
                                </div>

                                <div className="space-y-3">
                                  {Object.entries(skill.bonuses)
                                    .sort(([a], [b]) => Number(a) - Number(b))
                                    .map(([level, bonuses]) => (
                                      <div key={level}>
                                        <div className="text-[8px] uppercase tracking-widest font-black text-purple-300 mb-2">
                                          Nível {level}
                                        </div>

                                        <div className="space-y-1.5">
                                          {bonuses.map((bonus) => (
                                            <div
                                              key={bonus.id}
                                              className="rounded-lg border border-purple-500/10 bg-foreground/[0.025] p-2.5"
                                            >
                                              <div className="flex items-center gap-2">
                                                <Check className="size-3 text-purple-400 shrink-0" />

                                                <span className="text-[10px] font-bold">
                                                  {bonus.name ||
                                                    "Opção sem nome"}
                                                </span>
                                              </div>

                                              <p className="text-[9px] text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap pl-5">
                                                {bonus.description ||
                                                  "Sem descrição."}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </div>
                            )}
                        </div>
                      </div>
                    ))}

                    {cls.skills.length === 0 && (
                      <div className="py-8 text-center border border-dashed border-border/80 rounded-xl">
                        <GraduationCap className="size-7 mx-auto mb-2 text-muted-foreground opacity-30" />
                        <p className="text-xs text-muted-foreground">
                          Esta classe não possui habilidades.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ID TÉCNICO */}
                <div className="pt-2 border-t border-border/60 flex justify-between gap-3">
                  <span className="text-[8px] uppercase tracking-widest text-muted-foreground">
                    ID da classe
                  </span>

                  <code className="text-[8px] font-mono text-muted-foreground break-all text-right">
                    {cls.id}
                  </code>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  const [savingEquipment, setSavingEquipment] = useState(false)

  async function handleSaveSystemItem() {
    if (savingEquipment) return
    if (!sysDraft.name.trim() || !sysDraft.detail.trim())
      return alert("Preencha o nome e a descrição do equipamento.")

    const isMisc = sysDraft.category === "misc"
    const actions = isMisc ? [] : Array.isArray(sysDraft.actions) ? sysDraft.actions : []
    try {
      actions.forEach((action: any) => validateItemAction(action))
    } catch (error) {
      return alert(
        error instanceof Error ? error.message : "Revise as ações do item.",
      )
    }
    let imageUrl: string
    try {
      imageUrl = validateItemImageUrl(sysDraft.imageUrl)
    } catch (error) {
      return alert(error instanceof Error ? error.message : "URL de imagem inválida.")
    }

    let parsedWeight: ItemWeight
    try {
      parsedWeight = weightFields(
        sysDraft.weight ?? 100,
        sysDraft.weightUnit || "g",
      )
    } catch (error) {
      return alert(error instanceof Error ? error.message : "Peso inválido.")
    }
    const newEq = {
      ...sysDraft,
      ...parsedWeight,
      imageUrl,
      actions,
      consumable: sysDraft.consumable === true,
      id:
        sysDraft.id ||
        "custom-eq-" + Math.random().toString(36).substring(2, 10),
      name: sysDraft.name,
      category: sysDraft.category,
      cost: Number(sysDraft.cost),
      purchasable: String(sysDraft.purchasable) === "true",
      detail: isMisc
        ? String(sysDraft.detail).replace(/\[(?:BÔNUS|BONUS|MODIFICADOR|PENALIDADE)\s*:[^\]]*\]/gi, "").trim()
        : sysDraft.detail,
      damage: isMisc ? "" : sysDraft.damage,
      defense: isMisc ? "" : sysDraft.defense,
      mdef: isMisc ? "" : sysDraft.mdef,
      type: sysDraft.type,
      bonus: isMisc ? "" : sysDraft.bonus,
      effect: isMisc ? "" : sysDraft.effect,
      passiveBonuses: isMisc ? [] : (sysDraft.passiveBonuses || []),

      // Todo item custom começa na pasta CUSTOM
      folderId: sysDraft.folderId || "custom",
    }
    setSavingEquipment(true)
    try {
      await onCreateEquipment(newEq)
      setSysDraft({
        name: "",
        category: "weapon",
        consumable: false,
        imageUrl: "",
        cost: 100,
        purchasable: true,
        detail: "",
        damage: "",
        defense: "",
        mdef: "",
        type: "",
        bonus: "",
        effect: "",
        actions: [],
      })
      alert(
        sysDraft.id
          ? "Equipamento atualizado no catálogo e nas mochilas que usam este item."
          : "Equipamento forjado! Ele agora aparece no catálogo e na loja.",
      )
      setGmPanelTab("catalog")
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o equipamento.",
      )
    } finally {
      setSavingEquipment(false)
    }
  }

  const customDestinationFolders = allFolders.filter(folder => folder.id !== "system")
  const visibleStoreItems = customEquipment.filter((item) => {
    const matchesName = String(item.name ?? "").toLocaleLowerCase().includes(storeItemSearch.trim().toLocaleLowerCase())
    const matchesFolder = storeFolderFilter === "all" || (item.folderId || "custom") === storeFolderFilter
    return matchesName && matchesFolder
  })

  // Mesmas ações das abas originais, apresentadas em navegação temática unificada.
  const gmTabs = [
    { id: "catalog", label: "Catálogo", icon: Package },
    { id: "custom", label: "Forjar item", icon: Sword },
    { id: "classes", label: "Classes", icon: GraduationCap },
    { id: "checks", label: "Testes", icon: Dices },
    { id: "zenits", label: "Zenits", icon: Coins },
    { id: "hazards", label: "Ameaças", icon: Zap },
    { id: "store-config", label: "Loja & Pastas", icon: FolderOpen },
  ] as const

  function updateClass<K extends keyof GameClass>(key: K, value: GameClass[K]) {
    setClassDraft((prev) => ({
      ...prev,
      [key]: value,
    }))
  }

  function updateSkill(skillId: string, updates: Partial<GameSkill>) {
    setClassDraft((prev) => ({
      ...prev,
      skills: prev.skills.map((skill) =>
        skill.id === skillId ? { ...skill, ...updates } : skill,
      ),
    }))
  }

  function addSkill() {
    const skill = createSkillDraft()

    setClassDraft((prev) => ({
      ...prev,
      skills: [...prev.skills, skill],
    }))

    setExpandedSkillId(skill.id)
  }

  function removeSkill(skillId: string) {
    setClassDraft((prev) => ({
      ...prev,
      skills: prev.skills.filter((skill) => skill.id !== skillId),
    }))
  }

  async function handleSaveClass() {
    if (savingClass) return
    if (
      !classDraft.name.trim() ||
      !classDraft.archetype.trim() ||
      !classDraft.description.trim()
    ) {
      return alert("Preencha nome, arquétipo e descrição da classe.")
    }

    const validSkills = classDraft.skills.filter(
      (skill) => skill.name.trim() !== "" && skill.description.trim() !== "",
    )

    // Bases precisam de pelo menos uma habilidade para o criador distribuir níveis.
    // Subclasses podem existir somente para livros, sem pontos de perícia próprios.
    if (!classDraft.parentClassId && validSkills.length === 0) {
      return alert("Classes base precisam de ao menos uma habilidade. Subclasses podem ter apenas Grimório/Blueprints.")
    }
    if (classDraft.parentClassId && !getCampaignClassCatalog(characters, customClasses).some(cls =>
      !cls.parentClassId && cls.id === classDraft.parentClassId)) {
      return alert("A classe-mãe não existe no catálogo desta campanha.")
    }
    const conflictingSkillIds = new Set(
      [...getCampaignClassCatalog(characters, customClasses)]
        .filter(cls => cls.id !== classDraft.id)
        .flatMap(cls => cls.skills.map(skill => skill.id)),
    )
    if (validSkills.some(skill => conflictingSkillIds.has(skill.id))) {
      return alert("Uma habilidade possui o mesmo ID de outra classe. Crie um novo identificador.")
    }

    const newClass: CustomClassVisibility = {
      id: classDraft.id || "custom-class-" + Math.random().toString(36).substring(2, 10),
      ...(classDraft.parentClassId ? { parentClassId: classDraft.parentClassId } : {}),

      name: classDraft.name.trim(),
      playerVisible: isClassPublished(classDraft),
      archetype: classDraft.archetype.trim(),
      description: classDraft.description.trim(),

      hpPerLevel: Number(classDraft.hpPerLevel),
      mpPerLevel: Number(classDraft.mpPerLevel),
      primaryAttribute: classDraft.primaryAttribute,

      skills: validSkills.map((skill) => ({
        ...skill,

        id: classDraft.id && skill.id ? skill.id : "cskill-" + Math.random().toString(36).substring(2, 8),

        name: skill.name.trim(),
        maxLevel: Number(skill.maxLevel),
        description: skill.description.trim(),

        ...(skill.action
          ? {
            action: {
              cost: Number(skill.action.cost),
              resource: skill.action.resource,
            },
          }
          : {}),

        ...(skill.bonuses && Object.keys(skill.bonuses).length > 0
          ? {
            bonuses: skill.bonuses,
          }
          : {}),
      })),
    }

    setSavingClass(true)
    try {
      await onCreateClass(newClass)
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível salvar a classe.")
      setSavingClass(false)
      return
    }
    setSavingClass(false)

    setClassDraft({
      id: "",
      playerVisible: false,
      name: "",
      archetype: "",
      description: "",
      hpPerLevel: 5,
      mpPerLevel: 5,
      primaryAttribute: "mig",
      skills: [createSkillDraft()],
    })

    setExpandedSkillId(null)

    alert("Classe / subclasse salva no banco de dados.")
  }

  async function handleGiveLoot() {
    if (!selectedTargetCharId) return alert("Selecione um alvo.")
    const targetCharacter = characters.find(
      (c) => c.id === selectedTargetCharId,
    )

    setSendingLoot(true)
    try {
      if (gmPanelTab === "zenits") {
        if (!zenitAmount || Number(zenitAmount) <= 0) {
          setSendingLoot(false)
          return alert("Insira um valor válido de Zenits.")
        }
        await onGiveZenits(selectedTargetCharId, Number(zenitAmount))
        setZenitAmount("")
      } else if (gmPanelTab === "custom") {
        if (creationMode === "system") {
          setSendingLoot(false)
          return alert(
            "Para entregar um Equipamento de Sistema, forje-o primeiro e depois entregue via Catálogo.",
          )
        }
        if (
          !customItemName ||
          (!customItemContent && customItemType !== "app-blueprints")
        ) {
          setSendingLoot(false)
          return alert("Preencha o nome e o conteúdo da Relíquia.")
        }
        if (customItemType === "app-blueprints" && targetCharacter) {
          const gadgetsLevel = targetCharacter.skills["ti-gadgets"] || 0
          if (gadgetsLevel === 0) {
            setSendingLoot(false)
            return alert(
              `O personagem ${targetCharacter.name} não possui a perícia 'Aparelhos'.`,
            )
          }
        }
        await onGiveCustomItem(
          selectedTargetCharId,
          customItemName,
          customItemType,
          customItemContent,
          weightFields(customWeight.weight, customWeight.weightUnit),
        )
        setCustomItemName("")
        setCustomItemContent("")
      } else if (gmPanelTab === "catalog") {
        if (!selectedLoot) {
          setSendingLoot(false)
          return alert("Selecione um item do catálogo.")
        }
        await onGiveSystemItem(selectedTargetCharId, selectedLoot)
        setSelectedLoot(null)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao enviar.")
    } finally {
      setSendingLoot(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-2 backdrop-blur-md sm:p-5 overflow-hidden"
        >
          <motion.div
            variants={modalVariants}
            role="dialog"
            aria-modal="true"
            aria-label="Baú do mestre"
            className="rpg-modal relative flex h-full max-h-[96dvh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[26px] border border-border/80 bg-background text-foreground shadow-2xl sm:max-h-[92dvh]"
          >
            <div className="relative shrink-0 overflow-hidden border-b border-border/70 px-5 pb-5 pt-6 sm:px-8 sm:pb-6 sm:pt-7">
              <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-accent" />
              <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 size-72 rounded-full border-[38px] border-accent/[0.055]" />
              <div className="relative flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-accent">
                    <span className="inline-block size-2 rounded-full bg-accent" />
                    Painel de administração · Campanha
                  </div>
                  <h4 className="flex flex-wrap items-center gap-3 text-2xl font-black tracking-tight sm:text-[32px]">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
                      <Gift className="size-5" />
                    </span>
                    Baú do mestre<span className="text-accent">.</span>
                  </h4>
                  <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                    Gerencie itens, classes, recompensas e a organização da sua loja em um só lugar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar Baú do Mestre"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border/80 bg-foreground/[0.035] text-muted-foreground transition-colors hover:border-accent/30 hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <X className="size-4.5" />
                </button>
              </div>
            </div>

            <nav aria-label="Seções do Baú do Mestre" className="shrink-0 border-b border-border/70 bg-foreground/[0.015] px-3 py-3 sm:px-8">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar-sepia sm:gap-2">
                {gmTabs.map((tab) => {
                  const TabIcon = tab.icon
                  const active = gmPanelTab === tab.id
                  return (
                    <button
                      type="button"
                      key={tab.id}
                      aria-pressed={active}
                      onClick={() => {
                        setGmPanelTab(tab.id)
                        setSelectedLoot(null)
                      }}
                      className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-200 sm:px-4 ${active ? "border-accent/35 bg-accent/[0.12] text-accent shadow-sm" : "border-transparent text-muted-foreground hover:border-border/80 hover:bg-foreground/[0.055] hover:text-foreground"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
                    >
                      <TabIcon className="size-4 shrink-0" />
                      {tab.label}
                      {active && <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />}
                    </button>
                  )
                })}
              </div>
            </nav>


            <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-4 py-6 custom-scrollbar-sepia sm:px-8 sm:py-7">
              <div className="flex flex-col gap-6">
                {gmPanelTab === "checks" && (
                  <CustomChecksWorkbench campaignId={campaignId} checks={customChecks} revision={customChecksRevision} onRefresh={onRefreshCustomChecks} />
                )}
                {gmPanelTab !== "store-config" && gmPanelTab !== "checks" && (
                  <div className="flex flex-col gap-3">
                    {gmPanelTab !== "hazards" && gmPanelTab !== "catalog" && (
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-2">
                        <span className="bg-accent text-black size-5 flex items-center justify-center rounded-full">
                          1
                        </span>
                        {gmPanelTab === "custom"
                          ? "O Que Deseja Forjar?"
                          : gmPanelTab === "classes"
                            ? "Forjar Classe de Jogador"
                            : "Quantidade de Zenits"}
                      </h5>
                    )}


                    {gmPanelTab === "catalog" ? (
                      <section aria-labelledby="gm-catalog-heading" className="space-y-5">
                        {/* Vitrine editorial: usa as variáveis do tema ativo em vez de cores fixas. */}
                        <header className="relative isolate overflow-hidden rounded-[24px] border border-border/70 bg-foreground/[0.045] px-5 py-7 sm:px-8 sm:py-9">
                          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[43%] overflow-hidden sm:block">
                            <div className="absolute -right-20 -top-24 size-80 rotate-[23deg] rounded-[45px] border-[45px] border-accent/[0.11]" />
                            <div className="absolute -bottom-28 right-12 size-60 rotate-[23deg] rounded-[38px] border-[34px] border-accent/[0.08]" />
                            <div className="absolute bottom-8 right-12 flex size-32 rotate-[-12deg] items-center justify-center rounded-[28px] border border-accent/25 bg-accent/[0.09] text-accent shadow-xl lg:size-40">
                              <Sword className="size-16 lg:size-20" strokeWidth={1.1} />
                            </div>
                            <div className="absolute right-40 top-7 flex size-20 rotate-[13deg] items-center justify-center rounded-2xl border border-border/70 bg-background/85 text-accent shadow-lg lg:right-48">
                              <Shield className="size-9" strokeWidth={1.2} />
                            </div>
                          </div>
                          <div className="relative z-10 max-w-lg">
                            <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-accent">
                              <span className="h-px w-7 bg-accent" /> 01 / Compêndio do mestre
                            </div>
                            <h2 id="gm-catalog-heading" className="max-w-md text-[30px] font-black leading-[1.05] tracking-[-0.045em] sm:text-[42px]">
                              O arsenal da <span className="text-accent">sua campanha.</span>
                            </h2>
                            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
                              Encontre equipamentos, explore suas propriedades e escolha o que entregar aos seus personagens.
                            </p>
                            <div className="mt-6 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1.5 text-[11px] font-bold text-accent">
                                <Package className="size-3.5" /> {allLoot.length} itens disponíveis
                              </span>
                              <span className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/75 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                                <Sparkles className="size-3.5" /> {customCatalogCount} forjados
                              </span>
                            </div>
                          </div>
                        </header>

                        <div className="overflow-hidden rounded-[22px] border border-border/70 bg-foreground/[0.018]">
                          <div className="space-y-4 border-b border-border/70 p-4 sm:p-6">
                            <div className="flex flex-wrap items-end justify-between gap-3">
                              <div>
                                <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-accent">Acervo / Itens</p>
                                <h3 className="text-xl font-extrabold tracking-tight sm:text-2xl">Explorar equipamentos</h3>
                                <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
                                  {filteredLoot.length} {filteredLoot.length === 1 ? "resultado encontrado" : "resultados encontrados"}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-background/80 p-1" aria-label="Formato de visualização">
                                <button type="button" onClick={() => setCatalogView("grid")}
                                  aria-label="Exibir cartões" aria-pressed={catalogView === "grid"} title="Visualização em cartões"
                                  className={`flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${catalogView === "grid" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"}`}>
                                  <LayoutGrid className="size-4" />
                                </button>
                                <button type="button" onClick={() => setCatalogView("list")}
                                  aria-label="Exibir lista" aria-pressed={catalogView === "list"} title="Visualização em lista"
                                  className={`flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${catalogView === "list" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"}`}>
                                  <List className="size-4" />
                                </button>
                              </div>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_165px]">
                              <div className="relative min-w-0">
                                <label htmlFor="gm-catalog-search" className="sr-only">Buscar equipamentos</label>
                                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                <input id="gm-catalog-search" type="search" value={lootSearchQuery}
                                  onChange={(e) => { setLootSearchQuery(e.target.value); setSelectedLoot(null) }}
                                  placeholder="Nome, descrição, tipo..."
                                  className="h-11 w-full rounded-xl border border-border/80 bg-background/85 pl-10 pr-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/70 focus:border-accent/55 focus:ring-2 focus:ring-accent/15" />
                              </div>
                              <label className="relative block min-w-0">
                                <span className="sr-only">Origem dos equipamentos</span>
                                <select value={catalogSource}
                                  onChange={(e) => { setCatalogSource(e.target.value); setSelectedLoot(null) }}
                                  className="h-11 w-full appearance-none rounded-xl border border-border/80 bg-background/85 pl-3 pr-9 text-xs font-semibold text-foreground outline-none focus:border-accent/55 focus:ring-2 focus:ring-accent/15">
                                  <option value="all">Todas as origens</option>
                                  <option value="system">Do sistema</option>
                                  <option value="custom">Forjados</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                              </label>
                              <label className="relative block min-w-0">
                                <span className="sr-only">Ordenação do catálogo</span>
                                <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <select value={catalogSort} onChange={(e) => setCatalogSort(e.target.value)}
                                  className="h-11 w-full appearance-none rounded-xl border border-border/80 bg-background/85 pl-8 pr-8 text-xs font-semibold text-foreground outline-none focus:border-accent/55 focus:ring-2 focus:ring-accent/15">
                                  <option value="default">Ordem original</option>
                                  <option value="name">Nome (A–Z)</option>
                                  <option value="price-asc">Menor preço</option>
                                  <option value="price-desc">Maior preço</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                              </label>
                            </div>

                            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar-sepia" role="group" aria-label="Filtrar por categoria">
                              {catalogCategories.map((category) => {
                                const CategoryIcon = category.icon
                                const isActive = catalogCategory === category.id
                                const count = category.id === "all" ? allLoot.length : allLoot.filter((item) => item.category === category.id).length
                                return (
                                  <button key={category.id} type="button" aria-pressed={isActive}
                                    onClick={() => { setCatalogCategory(category.id); setSelectedLoot(null) }}
                                    className={`inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-2 text-[11px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isActive ? "border-accent/40 bg-accent/15 text-accent" : "border-border/80 bg-background/75 text-muted-foreground hover:border-accent/25 hover:text-foreground"}`}>
                                    <CategoryIcon className="size-3.5" /> {category.label}
                                    <span className={`text-[10px] tabular-nums ${isActive ? "text-accent" : "text-muted-foreground/70"}`}>{count}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          <div className="grid min-w-0 gap-5 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
                            {/* Grade visual: todo o cartão seleciona o item, sem expandir a altura dos vizinhos. */}
                            <div className="min-w-0">
                              {filteredLoot.length ? (
                                <div className={`max-h-[610px] overflow-y-auto pr-1 custom-scrollbar-sepia ${catalogView === "grid" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "flex flex-col gap-2.5"}`}>
                                  {filteredLoot.map((item) => {
                                    const isSelected = selectedLoot === item.id
                                    const isCustom = String(item.id).startsWith("custom-eq-")
                                    const ItemIcon = item.category === "weapon" ? Sword : item.category === "armor" || item.category === "shield" ? Shield : item.category === "accessory" ? Gem : Package
                                    return (
                                      <button key={item.id} type="button" aria-pressed={isSelected}
                                        onClick={() => setSelectedLoot(isSelected ? null : item.id)}
                                        className={`group relative min-w-0 overflow-hidden rounded-2xl border text-left transition-[border-color,background-color,transform,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${catalogView === "list" ? "flex items-center gap-3 p-2.5 sm:gap-4" : "flex flex-col"} ${isSelected ? "border-accent/70 bg-accent/[0.07] shadow-[0_0_0_1px_hsl(var(--accent)/0.12)]" : "border-border/70 bg-background/90 hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-lg"}`}>
                                        <div className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-foreground/[0.07] via-background to-accent/[0.09] ${catalogView === "list" ? "size-20 rounded-xl sm:size-24" : "h-40 w-full border-b border-border/50 sm:h-44"}`}>
                                          <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-8 size-32 rounded-full border-[18px] border-accent/[0.08]" />
                                          {itemImageUrl(item.imageUrl) ? (
                                            <ItemArtwork name={item.name} imageUrl={item.imageUrl} className={catalogView === "list" ? "size-16 sm:size-20" : "size-28 sm:size-32"} />
                                          ) : (
                                            <div className="flex size-20 items-center justify-center rounded-[22px] border border-border/60 bg-background/80 text-accent shadow-sm sm:size-24">
                                              <ItemIcon className="size-10 sm:size-12" strokeWidth={1.2} />
                                            </div>
                                          )}
                                          {catalogView === "grid" && <span className="absolute left-3 top-3 rounded-md border border-border/65 bg-background/90 px-2 py-1 text-[9px] font-black uppercase tracking-[0.09em] text-foreground shadow-sm">{catalogCategoryName[item.category] || "Item"}</span>}
                                          {isSelected && <span aria-label="Item selecionado" className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-md"><Check className="size-4" /></span>}
                                        </div>
                                        <div className={`flex min-w-0 flex-1 flex-col ${catalogView === "list" ? "py-1 pr-2" : "p-3.5"}`}>
                                          <div className="flex min-w-0 items-start justify-between gap-2">
                                            <h4 className={`min-w-0 text-sm font-extrabold leading-snug tracking-tight ${isSelected ? "text-accent" : "text-foreground"}`}>{item.name}</h4>
                                            {catalogView === "list" && <ChevronDown className={`mt-0.5 size-4 shrink-0 -rotate-90 ${isSelected ? "text-accent" : "text-muted-foreground"}`} />}
                                          </div>
                                          {catalogView === "grid" && <p className="mt-1.5 line-clamp-2 min-h-8 text-[11px] leading-relaxed text-muted-foreground">{item.detail || "Equipamento do compêndio."}</p>}
                                          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                                            <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-2 py-1 text-[11px] font-black tabular-nums text-accent"><Coins className="size-3" /> {Number(item.cost ?? 0).toLocaleString("pt-BR")} Z</span>
                                            {isCustom && <span className="rounded-md border border-border/70 bg-foreground/[0.045] px-1.5 py-1 text-[9px] font-bold text-muted-foreground">Forjado</span>}
                                            {item.consumable === true && <span className="rounded-md border border-border/70 px-1.5 py-1 text-[9px] font-bold text-muted-foreground">Consumível</span>}
                                            {item.purchasable === false && <span className="inline-flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-1 text-[9px] font-bold text-muted-foreground"><EyeOff className="size-3" /> Oculto</span>}
                                          </div>
                                        </div>
                                      </button>
                                    )
                                  })}
                                </div>
                              ) : (
                                <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-background/60 p-7 text-center">
                                  <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent/10 text-accent"><Search className="size-6" /></div>
                                  <h4 className="font-bold">Nenhum equipamento encontrado</h4>
                                  <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Experimente outra categoria ou ajuste os filtros.</p>
                                  <button type="button" onClick={resetCatalogFilters} className="mt-4 rounded-full border border-accent/40 px-4 py-2 text-xs font-bold text-accent transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Limpar filtros</button>
                                </div>
                              )}
                            </div>

                            {/* Ficha fixa no desktop; no mobile, fica após a lista. */}
                            <aside aria-label="Prévia do equipamento" className="min-w-0 lg:sticky lg:top-0">
                              <div className="overflow-hidden rounded-[20px] border border-border/80 bg-background/95 shadow-sm">
                                <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
                                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Ficha do item</span>
                                  {selectedCatalogItem ? <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-accent"><CheckCircle2 className="size-3.5" /> Selecionado</span> : <span className="text-[10px] text-muted-foreground">Pré-visualização</span>}
                                </div>
                                <AnimatePresence mode="wait" initial={false}>
                                  {selectedCatalogItem ? (
                                    <motion.div key={selectedCatalogItem.id} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -7 }} transition={{ duration: 0.17 }}>
                                      <div className="relative flex h-44 items-center justify-center overflow-hidden border-b border-border/60 bg-gradient-to-br from-foreground/[0.075] via-background to-accent/[0.12]">
                                        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-10 size-52 rotate-12 rounded-[35px] border-[26px] border-accent/[0.09]" />
                                        {itemImageUrl(selectedCatalogItem.imageUrl) ? (
                                          <ItemArtwork name={selectedCatalogItem.name} imageUrl={selectedCatalogItem.imageUrl} className="size-32" />
                                        ) : (
                                          <div className="flex size-24 items-center justify-center rounded-[22px] border border-accent/25 bg-background/75 text-accent"><Package className="size-12" strokeWidth={1.2} /></div>
                                        )}
                                      </div>
                                      <div className="space-y-4 p-4">
                                        <div>
                                          <p className="text-[10px] font-black uppercase tracking-wider text-accent">{catalogCategoryName[selectedCatalogItem.category] || "Equipamento"}</p>
                                          <h4 className="mt-1 text-lg font-black leading-snug tracking-tight">{selectedCatalogItem.name}</h4>
                                          <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <span className="rounded-lg border border-accent/25 bg-accent/10 px-2.5 py-1.5 text-sm font-black tabular-nums text-accent">{Number(selectedCatalogItem.cost ?? 0).toLocaleString("pt-BR")} Z</span>
                                            {selectedCatalogItem.type && <span className="rounded-full border border-border/75 px-2 py-1 text-[10px] text-muted-foreground">{selectedCatalogItem.type}</span>}
                                            {selectedCatalogItem.purchasable === false && <span className="rounded-full border border-border/75 px-2 py-1 text-[10px] text-muted-foreground">Oculto na loja</span>}
                                          </div>
                                        </div>
                                        <p className="max-h-28 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground custom-scrollbar-sepia">{selectedCatalogItem.detail || "Sem descrição."}</p>
                                        {(selectedCatalogItem.damage || selectedCatalogItem.defense || selectedCatalogItem.mdef || selectedCatalogItem.bonus || selectedCatalogItem.effect || selectedCatalogItem.consumable === true) && (
                                          <div className="flex flex-wrap gap-1.5 border-t border-border/70 pt-3">
                                            {selectedCatalogItem.damage && <span className="rounded-md border border-border/80 bg-foreground/[0.04] px-2 py-1 text-[10px] font-semibold">Dano: {selectedCatalogItem.damage}</span>}
                                            {selectedCatalogItem.defense && <span className="rounded-md border border-border/80 bg-foreground/[0.04] px-2 py-1 text-[10px] font-semibold">DEF: {selectedCatalogItem.defense}</span>}
                                            {selectedCatalogItem.mdef && <span className="rounded-md border border-border/80 bg-foreground/[0.04] px-2 py-1 text-[10px] font-semibold">M.DEF: {selectedCatalogItem.mdef}</span>}
                                            {selectedCatalogItem.bonus && <span className="rounded-md border border-border/80 bg-foreground/[0.04] px-2 py-1 text-[10px] font-semibold">Bônus: {selectedCatalogItem.bonus}</span>}
                                            {selectedCatalogItem.effect && <span className="rounded-md border border-border/80 bg-foreground/[0.04] px-2 py-1 text-[10px] font-semibold">Efeito: {selectedCatalogItem.effect}</span>}
                                            {selectedCatalogItem.consumable === true && <span className="rounded-md border border-border/80 px-2 py-1 text-[10px] font-semibold">Consumível</span>}
                                          </div>
                                        )}
                                        {String(selectedCatalogItem.id).startsWith("custom-eq-") && (
                                          <div className="flex gap-2 border-t border-border/70 pt-3">
                                            <button type="button" onClick={() => { setSysDraft({ ...selectedCatalogItem, actions: getItemActions(selectedCatalogItem) }); setCreationMode("system"); setGmPanelTab("custom") }}
                                              className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 text-xs font-bold text-accent transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                                              <Pencil className="size-3.5" /> Editar item
                                            </button>
                                            <button type="button" aria-label={`Excluir ${selectedCatalogItem.name}`} title="Excluir item"
                                              onClick={() => { onDeleteEquipment(selectedCatalogItem.id); setSelectedLoot(null) }}
                                              className="flex size-9 items-center justify-center rounded-lg border border-border/80 text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive">
                                              <Trash2 className="size-4" />
                                            </button>
                                          </div>
                                        )}
                                        <div className="flex items-start gap-2 rounded-xl border border-accent/20 bg-accent/[0.065] p-3 text-[11px] leading-relaxed text-muted-foreground">
                                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
                                          <span>Item escolhido. Selecione o destinatário logo abaixo e use <strong className="text-foreground">Entregar Item</strong>.</span>
                                        </div>
                                      </div>
                                    </motion.div>
                                  ) : (
                                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[310px] flex-col items-center justify-center px-7 py-10 text-center">
                                      <div className="mb-4 flex size-20 items-center justify-center rounded-3xl border border-accent/20 bg-accent/[0.07] text-accent"><Package className="size-9" strokeWidth={1.35} /></div>
                                      <h4 className="text-sm font-extrabold">Sua próxima descoberta</h4>
                                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Clique em um equipamento para conferir detalhes, atributos e selecionar sua entrega.</p>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </aside>
                          </div>
                        </div>
                      </section>
                    ) : gmPanelTab === "custom" ? (
                      <div className="flex flex-col gap-4 border border-border/60 rounded-xl p-5 bg-foreground/[0.03] shadow-inner">
                        <div className="flex gap-2 p-1 bg-foreground/[0.045] border border-border/80 rounded-lg">
                          <button
                            onClick={() => setCreationMode("system")}
                            className={`flex-1 text-xs py-2 rounded-md font-bold transition-all ${creationMode === "system" ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-white"}`}
                          >
                            Equipamento (Sistema)
                          </button>
                          <button
                            onClick={() => setCreationMode("relic")}
                            className={`flex-1 text-xs py-2 rounded-md font-bold transition-all ${creationMode === "relic" ? "bg-purple-500/20 text-purple-400" : "text-muted-foreground hover:text-white"}`}
                          >
                            Relíquia (Narrativa)
                          </button>
                        </div>

                        {creationMode === "relic" ? (
                          <>
                            <input
                              type="text"
                              value={customItemName}
                              onChange={(e) => setCustomItemName(e.target.value)}
                              placeholder="Nome da Relíquia (Ex: Carta do Rei)"
                              className="w-full bg-background/80 border border-border/80 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                            />
                            <select
                              value={customItemType}
                              onChange={(e) =>
                                setCustomItemType(e.target.value as any)
                              }
                              className="w-full bg-background/80 border border-border/80 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-all"
                            >
                              <option value="text">
                                Pergaminho / Carta (Texto Escrito)
                              </option>
                              <option value="image">
                                Magia de Fótons (Imagem via URL)
                              </option>
                              <option value="video">
                                Orbe da Lembrança (Vídeo do YouTube)
                              </option>
                              <option value="app-blueprints">
                                Interface: Almanaque Magitech
                              </option>
                            </select>
                            <ItemWeightField
                              value={customWeight}
                              onChange={setCustomWeight}
                            />
                            {customItemType === "text" ? (
                              <textarea
                                value={customItemContent}
                                onChange={(e) =>
                                  setCustomItemContent(e.target.value)
                                }
                                placeholder="Escreva o conteúdo da carta aqui..."
                                rows={4}
                                className="w-full bg-background/80 border border-border/80 rounded-lg py-3 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-all custom-scrollbar-sepia resize-none"
                              />
                            ) : customItemType === "app-blueprints" ? (
                              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs text-blue-200 flex gap-3 items-center">
                                <Info className="size-5 shrink-0 text-blue-400" />{" "}
                                Este item instalará um aplicativo na mochila do
                                jogador. Necessita da classe Inventor.
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={customItemContent}
                                onChange={(e) =>
                                  setCustomItemContent(e.target.value)
                                }
                                placeholder={`Cole a URL ${customItemType === "video" ? "do Youtube" : "da Imagem"} aqui...`}
                                className="w-full bg-background/80 border border-border/80 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-all"
                              />
                            )}
                          </>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            <label className="col-span-2 sm:col-span-1 flex flex-col gap-1.5">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                                Nome
                              </span>
                              <input
                                type="text"
                                value={sysDraft.name}
                                onChange={(e) =>
                                  setSysDraft({
                                    ...sysDraft,
                                    name: e.target.value,
                                  })
                                }
                                className="bg-background/80 border border-border/80 rounded p-2 text-sm outline-none focus:border-accent/50"
                              />
                            </label>
                            <label className="col-span-2 sm:col-span-1 flex flex-col gap-1.5">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                                Categoria
                              </span>
                              <select
                                value={sysDraft.category}
                                onChange={(e) =>
                                  setSysDraft({
                                    ...sysDraft,
                                    category: e.target.value,
                                    ...(e.target.value === "misc"
                                      ? { bonus: "", defense: "", mdef: "", damage: "", effect: "", actions: [], passiveBonuses: [] }
                                      : {}),
                                  })
                                }
                                className="bg-background/80 border border-border/80 rounded p-2 text-sm outline-none focus:border-accent/50"
                              >
                                <option value="weapon">Arma</option>
                                <option value="armor">Armadura</option>
                                <option value="shield">Escudo</option>
                                <option value="accessory">Acessório</option>
                                <option value="misc">Diversos</option>
                              </select>
                            </label>
                            <label className="col-span-2 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                              <input type="checkbox" checked={sysDraft.consumable === true}
                                onChange={event => setSysDraft({ ...sysDraft, consumable: event.target.checked })} />
                              <span><strong>Consumível</strong><small className="block text-xs text-muted-foreground">Após confirmar, uma unidade será removida da mochila.</small></span>
                            </label>
                            {sysDraft.category === "misc" && <p className="col-span-2 rounded-lg border border-blue-500/30 p-3 text-xs text-blue-200">Itens Diversos são narrativos, sem bônus, modificadores ou ações mecânicas.</p>}
                            <label className="flex flex-col gap-1.5">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                                Valor (Z)
                              </span>
                              <input
                                type="number"
                                value={sysDraft.cost}
                                onChange={(e) =>
                                  setSysDraft({
                                    ...sysDraft,
                                    cost: Number(e.target.value),
                                  })
                                }
                                className="bg-background/80 border border-border/80 rounded p-2 text-sm font-mono outline-none focus:border-accent/50"
                              />
                            </label>
                            <label className="flex flex-col gap-1.5">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                                Na Loja?
                              </span>
                              <select
                                value={String(sysDraft.purchasable)}
                                onChange={(e) =>
                                  setSysDraft({
                                    ...sysDraft,
                                    purchasable: e.target.value === "true",
                                  })
                                }
                                className="bg-background/80 border border-border/80 rounded p-2 text-sm outline-none focus:border-accent/50"
                              >
                                <option value="true">Sim (Visível)</option>
                                <option value="false">Não (Loot Oculto)</option>
                              </select>
                            </label>
                            <div className="col-span-2 flex flex-col gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                              <label className="flex flex-col gap-1.5">
                                <span className="text-[10px] uppercase tracking-widest font-bold text-amber-200">Imagem do item (opcional)</span>
                                <input
                                  type="url"
                                  value={sysDraft.imageUrl || ""}
                                  onChange={event => setSysDraft({ ...sysDraft, imageUrl: event.target.value })}
                                  placeholder="https://exemplo.com/arte-do-item.png"
                                  maxLength={2048}
                                  className="rounded-md border border-border/80 bg-background/80 p-2 text-sm text-foreground outline-none focus:border-accent/60"
                                />
                                <span className="text-[10px] leading-relaxed text-muted-foreground">Cole uma URL pública HTTPS da imagem. Ela será mostrada na loja e na mochila. Deixe vazio para usar os ícones tradicionais.</span>
                              </label>
                              {itemImageUrl(sysDraft.imageUrl) && <div className="flex items-center gap-3">
                                <ItemArtwork name={sysDraft.name || "Prévia do item"} imageUrl={sysDraft.imageUrl} expandable className="size-20" />
                                <span className="text-xs text-amber-200">Prévia — clique para ampliar</span>
                              </div>}
                              {sysDraft.imageUrl?.trim() && !itemImageUrl(sysDraft.imageUrl) && <p className="text-xs text-red-300">Informe uma URL HTTPS válida ou deixe o campo vazio.</p>}
                            </div>
                            <label className="col-span-2 flex flex-col gap-1.5">
                              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                                Regras e Descrição
                              </span>
                              <textarea
                                value={sysDraft.detail}
                                onChange={(e) =>
                                  setSysDraft({
                                    ...sysDraft,
                                    detail: e.target.value,
                                  })
                                }
                                rows={3}
                                className="bg-background/80 border border-border/80 rounded p-2 text-sm outline-none resize-none focus:border-accent/50 custom-scrollbar-sepia"
                                placeholder={sysDraft.category === "misc" ? "Descrição do item, uso narrativo e informações para o jogador" : "[BÔNUS: +1 Dano]\n[MODIFICADOR: Precisão usa DES+VIG]"}
                              />
                            </label>

                            {sysDraft.category !== "misc" && <div className="col-span-2 border-t border-border/60 pt-3 mt-1 grid grid-cols-3 gap-3">
                              <input
                                type="text"
                                value={sysDraft.type}
                                onChange={(e) =>
                                  setSysDraft({
                                    ...sysDraft,
                                    type: e.target.value,
                                  })
                                }
                                placeholder="Tipo (Fogo, Leve)"
                                className="bg-background/80 border border-border/80 rounded p-2 text-xs outline-none"
                              />
                              <input
                                type="text"
                                value={sysDraft.damage}
                                onChange={(e) =>
                                  setSysDraft({
                                    ...sysDraft,
                                    damage: e.target.value,
                                  })
                                }
                                placeholder="Dano (Ex: 10, d10)"
                                className="bg-background/80 border border-border/80 rounded p-2 text-xs outline-none font-mono"
                              />
                              <input
                                type="text"
                                value={sysDraft.bonus}
                                onChange={(e) =>
                                  setSysDraft({
                                    ...sysDraft,
                                    bonus: e.target.value,
                                  })
                                }
                                placeholder="Bônus (Ex: +2 Iniciativa)"
                                className="bg-background/80 border border-border/80 rounded p-2 text-xs outline-none"
                              />
                              <input
                                type="text"
                                value={sysDraft.defense}
                                onChange={(e) =>
                                  setSysDraft({
                                    ...sysDraft,
                                    defense: e.target.value,
                                  })
                                }
                                placeholder="DEF (Ex: 11)"
                                className="bg-background/80 border border-border/80 rounded p-2 text-xs outline-none font-mono"
                              />
                              <input
                                type="text"
                                value={sysDraft.mdef}
                                onChange={(e) =>
                                  setSysDraft({
                                    ...sysDraft,
                                    mdef: e.target.value,
                                  })
                                }
                                placeholder="M.DEF (Ex: 8)"
                                className="bg-background/80 border border-border/80 rounded p-2 text-xs outline-none font-mono"
                              />
                              <input
                                type="text"
                                value={sysDraft.effect}
                                onChange={(e) =>
                                  setSysDraft({
                                    ...sysDraft,
                                    effect: e.target.value,
                                  })
                                }
                                placeholder="Efeito Secundário"
                                className="bg-background/80 border border-border/80 rounded p-2 text-xs outline-none"
                              />
                            </div>}

                            {sysDraft.category !== "misc" && <div className="col-span-2">
                              <ItemActionsEditor
                                actions={sysDraft.actions || []}
                                onChange={(actions) =>
                                  setSysDraft({ ...sysDraft, actions })
                                }
                              />
                            </div>}
                            <div className="col-span-2">
                              <ItemWeightField
                                value={sysDraft}
                                onChange={(value) =>
                                  setSysDraft({ ...sysDraft, ...value })
                                }
                              />
                            </div>
                            {sysDraft.id && (
                              <p className="col-span-2 text-xs text-cyan-200">
                                Editando {sysDraft.name}. As alterações mantêm o
                                ID e atualizam também as cópias nas mochilas.
                              </p>
                            )}
                            <Button
                              className="col-span-2 mt-2 bg-accent text-black hover:bg-accent/90 font-bold"
                              disabled={savingEquipment}
                              onClick={handleSaveSystemItem}
                            >
                              <Save className="size-4 mr-2" />{" "}
                              {sysDraft.id
                                ? "Salvar alterações"
                                : "Salvar Equipamento"}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : gmPanelTab === "hazards" ? (
                      <GMHazardPanel
                        activeHazards={activeHazards}
                        characters={characters}
                        onLaunch={onLaunchHazard}
                        onStop={onStopHazard}
                      />
                    ) : gmPanelTab === "classes" ? (
                      <div className="flex flex-col gap-6">
                        {/* =========================================================
    CLASSES JÁ CRIADAS
========================================================= */}
                        <div className="rounded-2xl border border-purple-500/20 bg-foreground/[0.025] overflow-hidden">
                          <div className="p-4 border-b border-border/60 bg-purple-500/[0.03]">
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div className="size-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                  <FolderOpen className="size-5 text-purple-400" />
                                </div>

                                <div>
                                  <h3 className="text-[11px] font-black uppercase tracking-widest text-purple-400">
                                    Classes Criadas
                                  </h3>

                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    {Array.isArray(customClasses)
                                      ? customClasses.length
                                      : 0}{" "}
                                    classe(s) homebrew disponível(is)
                                  </p>
                                </div>
                              </div>

                              <div className="text-[9px] uppercase tracking-widest text-muted-foreground hidden sm:block">
                                Clique para ver todos os detalhes
                              </div>
                            </div>
                          </div>

                          <div className="p-3 space-y-2">
                            {!Array.isArray(customClasses) ||
                              customClasses.length === 0 ? (
                              <div className="py-10 flex flex-col items-center justify-center text-center border border-dashed border-border/80 rounded-xl">
                                <GraduationCap className="size-9 text-muted-foreground opacity-20 mb-3" />

                                <p className="text-sm font-bold text-muted-foreground">
                                  Nenhuma classe homebrew criada
                                </p>

                                <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-xs">
                                  As classes que você oficializar pelo editor
                                  aparecerão aqui.
                                </p>
                              </div>
                            ) : (
                              customClasses.map((cls: GameClass) => (
                                <CreatedClassCard
                                  key={cls.id}
                                  cls={cls}
                                  expanded={expandedClassId === cls.id}
                                  onToggle={() =>
                                    setExpandedClassId(
                                      expandedClassId === cls.id ? null : cls.id,
                                    )
                                  }
                                  onEdit={() => { setClassDraft({ ...structuredClone(cls), playerVisible: isClassPublished(cls) }); setExpandedSkillId(null) }}
                                  onDelete={() => {
                                    onDeleteClass(cls.id)

                                    if (expandedClassId === cls.id) {
                                      setExpandedClassId(null)
                                    }
                                  }}
                                />
                              ))
                            )}
                          </div>
                        </div>

                        <ClassBooksWorkbench campaignId={campaignId} characters={characters} refreshToken={booksRevision} />
                        <div className="flex items-center gap-3">
                          <div className="h-px flex-1 bg-foreground/[0.045]" />

                          <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-black">
                            Nova Classe
                          </span>

                          <div className="h-px flex-1 bg-foreground/[0.045]" />
                        </div>

                        {/* CABEÇALHO DA CLASSE */}
                        <div className="rounded-2xl border border-amber-600/30 bg-foreground/[0.03] overflow-hidden">
                          <div className="p-4 border-b border-border/60 bg-amber-600/[0.03]">
                            <div className="flex items-center gap-3">
                              <div className="size-10 rounded-xl bg-amber-600/10 border border-amber-600/20 flex items-center justify-center">
                                <GraduationCap className="size-5 text-amber-500" />
                              </div>

                              <div>
                                <h3 className="font-serif text-lg font-black text-amber-500">
                                  Forjar Classe
                                </h3>

                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">
                                  Editor completo de classe homebrew
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 space-y-4">
                            <label className="flex flex-col gap-1.5 text-xs text-amber-400">
                              Tipo de criação
                              <select className="bg-background/80 border border-border/80 rounded-lg px-3 py-2.5 text-sm" value={classDraft.parentClassId || ""} onChange={e => updateClass("parentClassId", e.target.value || undefined)}>
                                <option value="">Classe independente</option>
                                {getCampaignClassCatalog(characters, Array.isArray(customClasses) ? customClasses : []).filter(c => !c.parentClassId && c.id !== classDraft.id).map(c => (
                                  <option key={c.id} value={c.id}>Subclasse de {c.name}</option>
                                ))}
                              </select>
                            </label>
                            {classDraft.id && <p className="text-xs text-amber-300">Editando classe existente. O ID será preservado para não perder vínculos dos personagens.</p>}
                            <label className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                              <input type="checkbox" checked={isClassPublished(classDraft)}
                                onChange={event => setClassDraft(previous => ({ ...previous, playerVisible: event.target.checked }))} />
                              <span>
                                <strong>Liberar para evolução dos jogadores</strong>
                                <small className="block text-xs text-muted-foreground">Desmarcada: a classe ou subclasse não aparece na tela Aprender. A concessão do mestre continua disponível.</small>
                              </span>
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                              <label className="flex flex-col gap-1.5">
                                <span className="text-[9px] uppercase tracking-widest font-bold text-amber-500">
                                  Nome
                                </span>

                                <input
                                  value={classDraft.name}
                                  onChange={(e) =>
                                    updateClass("name", e.target.value)
                                  }
                                  placeholder="Ex: Necromante"
                                  className="bg-background/80 border border-border/80 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-amber-600/50"
                                />
                              </label>

                              <label className="flex flex-col gap-1.5">
                                <span className="text-[9px] uppercase tracking-widest font-bold text-amber-500">
                                  Arquétipo
                                </span>

                                <input
                                  value={classDraft.archetype}
                                  onChange={(e) =>
                                    updateClass("archetype", e.target.value)
                                  }
                                  placeholder="Ex: Invocador das Trevas"
                                  className="bg-background/80 border border-border/80 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-amber-600/50"
                                />
                              </label>
                            </div>

                            <label className="flex flex-col gap-1.5">
                              <span className="text-[9px] uppercase tracking-widest font-bold text-amber-500">
                                Descrição
                              </span>

                              <textarea
                                value={classDraft.description}
                                onChange={(e) =>
                                  updateClass("description", e.target.value)
                                }
                                rows={3}
                                placeholder="Descreva a identidade e fantasia da classe..."
                                className="bg-background/80 border border-border/80 rounded-lg px-3 py-2.5 text-sm resize-none outline-none focus:border-amber-600/50"
                              />
                            </label>

                            <div className="grid grid-cols-3 gap-3">
                              <label className="flex flex-col gap-1.5">
                                <span className="text-[9px] uppercase tracking-widest font-bold text-red-400">
                                  PV / Nível
                                </span>

                                <input
                                  type="number"
                                  min={0}
                                  value={classDraft.hpPerLevel}
                                  onChange={(e) =>
                                    updateClass(
                                      "hpPerLevel",
                                      Number(e.target.value),
                                    )
                                  }
                                  className="bg-background/80 border border-border/80 rounded-lg px-3 py-2 font-mono text-sm"
                                />
                              </label>

                              <label className="flex flex-col gap-1.5">
                                <span className="text-[9px] uppercase tracking-widest font-bold text-blue-400">
                                  PM / Nível
                                </span>

                                <input
                                  type="number"
                                  min={0}
                                  value={classDraft.mpPerLevel}
                                  onChange={(e) =>
                                    updateClass(
                                      "mpPerLevel",
                                      Number(e.target.value),
                                    )
                                  }
                                  className="bg-background/80 border border-border/80 rounded-lg px-3 py-2 font-mono text-sm"
                                />
                              </label>

                              <label className="flex flex-col gap-1.5">
                                <span className="text-[9px] uppercase tracking-widest font-bold text-purple-400">
                                  Atributo-chave
                                </span>

                                <select
                                  value={classDraft.primaryAttribute}
                                  onChange={(e) =>
                                    updateClass(
                                      "primaryAttribute",
                                      e.target
                                        .value as GameClass["primaryAttribute"],
                                    )
                                  }
                                  className="bg-background/80 border border-border/80 rounded-lg px-3 py-2 text-sm"
                                >
                                  <option value="mig">Vigor (MIG)</option>
                                  <option value="dex">Destreza (DEX)</option>
                                  <option value="ins">Intuição (INS)</option>
                                  <option value="wlp">Vontade (WLP)</option>
                                </select>
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* HABILIDADES */}
                        <div className="rounded-2xl border border-amber-600/20 bg-foreground/[0.025] overflow-hidden">
                          <div className="p-4 flex items-center justify-between border-b border-border/60">
                            <div>
                              <h3 className="text-[11px] font-black uppercase tracking-widest text-amber-500">
                                Habilidades da Classe
                              </h3>

                              <p className="text-[10px] text-muted-foreground mt-1">
                                {classDraft.skills.length} habilidade(s)
                                configurada(s)
                              </p>
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={addSkill}
                              className="h-8 text-[10px] border-amber-600/30 text-amber-500"
                            >
                              <Plus className="size-3 mr-1" />
                              Nova Habilidade
                            </Button>
                          </div>

                          <div className="p-3 space-y-2">
                            {classDraft.skills.map((skill) => (
                              <SkillForgeCard
                                key={skill.id}
                                skill={skill}
                                expanded={expandedSkillId === skill.id}
                                onToggle={() => {
                                  setExpandedSkillId((current) =>
                                    current === skill.id ? null : skill.id,
                                  )
                                }}
                                onUpdate={(updates) =>
                                  updateSkill(skill.id, updates)
                                }
                                onRemove={() => removeSkill(skill.id)}
                                setClassDraft={setClassDraft}
                              />
                            ))}
                          </div>
                        </div>

                        {/* PRÉ-VISUALIZAÇÃO */}
                        <div className="rounded-2xl border border-border/60 bg-foreground/[0.025] p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Eye className="size-4 text-amber-500" />

                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                              Prévia da Classe
                            </span>
                          </div>

                          <div className="rounded-xl border border-amber-600/20 bg-amber-600/[0.03] p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="font-serif text-xl font-black text-amber-500">
                                  {classDraft.name || "Nome da Classe"}
                                </h3>

                                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                                  {classDraft.archetype || "Arquétipo"}
                                </p>
                              </div>

                              <div className="flex gap-2 text-[9px] font-mono">
                                <span className="px-2 py-1 rounded bg-red-500/10 text-red-300">
                                  {classDraft.hpPerLevel} PV
                                </span>

                                <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-300">
                                  {classDraft.mpPerLevel} PM
                                </span>
                              </div>
                            </div>

                            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                              {classDraft.description || "Descrição da classe..."}
                            </p>

                            <div className="mt-4 grid gap-2">
                              {classDraft.skills.map((skill) => (
                                <div
                                  key={skill.id}
                                  className="rounded-lg bg-foreground/[0.03] border border-border/60 p-3"
                                >
                                  <div className="flex justify-between gap-3">
                                    <span className="font-bold text-xs">
                                      {skill.name || "Habilidade sem nome"}
                                    </span>

                                    <span className="text-[9px] font-mono text-muted-foreground">
                                      Nv. {skill.maxLevel}
                                    </span>
                                  </div>

                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    {skill.description}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* SALVAR */}
                        <Button
                          className="h-11 bg-amber-600 text-white hover:bg-amber-700 font-bold"
                          onClick={() => void handleSaveClass()}
                          disabled={savingClass}
                        >
                          <Save className="size-4 mr-2" />
                          {savingClass ? "Salvando..." : classDraft.id ? "Salvar alterações" : classDraft.parentClassId ? "Criar Subclasse" : "Oficializar Classe"}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4 border border-border/60 rounded-xl p-5 bg-foreground/[0.03] shadow-inner">
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-accent font-bold text-lg">
                            Z
                          </span>
                          <input
                            type="number"
                            value={zenitAmount}
                            onChange={(e) =>
                              setZenitAmount(
                                e.target.value === ""
                                  ? ""
                                  : Number(e.target.value),
                              )
                            }
                            placeholder="Ex: 500"
                            className="w-full bg-background/80 border border-border/80 rounded-lg py-4 pl-12 pr-4 text-xl font-mono font-bold text-accent placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground bg-accent/5 p-3 rounded-lg border border-accent/10 flex items-center gap-2">
                          <Coins className="size-4 text-accent shrink-0" /> O
                          valor será somado diretamente à carteira do personagem
                          selecionado.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Destinatário somente nas abas que realizam uma entrega. */}
                {(["catalog", "custom", "zenits"] as const).some((tab) => tab === gmPanelTab) && (
                  <div
                    className={`flex flex-col gap-3 transition-opacity duration-300 ${selectedLoot || (gmPanelTab === "custom" && creationMode === "relic") || gmPanelTab === "zenits" ? "opacity-100" : "opacity-40 pointer-events-none"}`}
                  >
                    {gmPanelTab === "catalog" ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <div>
                          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-accent">02 / Entrega</div>
                          <h3 className="text-xl font-extrabold tracking-tight">Escolha quem recebe</h3>
                          <p className="mt-1 text-xs text-muted-foreground">Envie o equipamento para o inventário de um personagem ou criatura da mesa.</p>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${selectedTargetCharId ? "border-accent/35 bg-accent/10 text-accent" : "border-border/80 text-muted-foreground"}`}>
                          {selectedTargetCharId ? <CheckCircle2 className="size-3.5" /> : <Package className="size-3.5" />}
                          {selectedTargetCharId ? "Destinatário escolhido" : "Aguardando escolha"}
                        </span>
                      </div>
                    ) : (
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-2">
                        <span className="bg-accent text-black size-5 flex items-center justify-center rounded-full">2</span>
                        Destinatário (Inventário)
                      </h5>
                    )}

                    <div className={`grid gap-3 sm:grid-cols-3 border border-border/70 rounded-[20px] p-3 sm:p-4 max-h-[245px] overflow-y-auto custom-scrollbar-sepia ${gmPanelTab === "catalog" ? "bg-foreground/[0.018]" : "bg-foreground/[0.03] shadow-inner"}`}>

                      {characters.map((c) => {
                        const owner = members.find(
                          (m) => m.userId === c.ownerId,
                        )
                        const isSelected = selectedTargetCharId === c.id
                        return (
                          <button
                            key={c.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => setSelectedTargetCharId(c.id)}
                            className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${gmPanelTab === "catalog" ? (isSelected ? "border-accent/70 bg-accent/10" : "border-border/70 bg-background/90 hover:border-accent/35 hover:bg-accent/[0.04]") : (isSelected ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.15)]" : "border-border/60 bg-background/90 hover:border-border hover:bg-foreground/[0.055]")}`}
                          >
                            <CharacterPortrait
                              src={c.avatarUrl}
                              alt={`Retrato de ${c.name}`}
                              frame={c.portraitFrame}
                              crop={c.portraitCrop}
                              className={`size-10 shrink-0 ${isSelected ? "is-selected" : ""}`}
                              sizes="40px"
                            />
                            <div className="flex flex-col items-start min-w-0">
                              <p className="font-serif font-bold text-sm text-foreground truncate w-full text-left">
                                {c.name}
                              </p>
                              <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5 truncate w-full text-left">
                                {owner?.name || "Desconhecido"}
                              </p>
                            </div>
                            {gmPanelTab === "catalog" && isSelected && <CheckCircle2 className="ml-auto size-4 shrink-0 text-accent" />}
                          </button>
                        )
                      })}

                      {gmPanelTab === "catalog" &&
                        activeCreatures.map((c) => (
                          <button
                            key={c.instanceId}
                            type="button"
                            aria-pressed={selectedTargetCharId === c.instanceId}
                            onClick={() => setSelectedTargetCharId(c.instanceId)}
                            className={`flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${selectedTargetCharId === c.instanceId ? "border-accent/70 bg-accent/10" : "border-border/70 bg-background/90 hover:border-accent/35 hover:bg-accent/[0.04]"}`}
                          >
                            <div
                              className={`size-10 rounded-full border overflow-hidden shrink-0 ${selectedTargetCharId === c.instanceId ? "border-destructive" : "border-border/80"}`}
                            >
                              <img
                                src={
                                  c.imageUrl ||
                                  "/mystic-adventurer-portrait.png"
                                }
                                alt=""
                                className="w-full h-full object-cover grayscale"
                              />
                            </div>
                            <div className="flex flex-col items-start min-w-0">
                              <p className="font-serif font-bold text-sm text-destructive truncate w-full text-left">
                                {c.name}
                              </p>
                              <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-0.5 truncate w-full text-left">
                                Na mesa
                              </p>
                            </div>
                            {selectedTargetCharId === c.instanceId && <CheckCircle2 className="ml-auto size-4 shrink-0 text-accent" />}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {gmPanelTab === "store-config" && (
                  <section className="space-y-5" aria-labelledby="store-folders-title">
                    {/* Abertura editorial + indicadores, usando as cores do tema ativo. */}
                    <div className="relative overflow-hidden rounded-[22px] border border-border/70 bg-foreground/[0.025] px-5 py-6 sm:px-7 sm:py-7">
                      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 size-48 rotate-12 rounded-[36px] border-[26px] border-accent/[0.07]" />
                      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-xl">
                          <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-accent">
                            <span className="h-px w-7 bg-accent" />
                            Acervo / Organização
                          </div>
                          <h2 id="store-folders-title" className="text-[28px] font-black leading-[1.05] tracking-tight sm:text-[40px]">
                            Pastas da <span className="relative inline-block text-accent">Loja<span aria-hidden="true" className="absolute bottom-0 left-0 -z-10 h-2 w-full bg-accent/10" /></span>.
                          </h2>
                          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                            Crie e organize coleções, escolha o que os jogadores podem ver e distribua seus itens forjados.
                          </p>
                        </div>
                        <div className="grid grid-cols-3 divide-x divide-border/70 rounded-2xl border border-border/70 bg-background/75 p-3 text-center shadow-sm sm:min-w-[280px] sm:p-4">
                          <div className="px-2">
                            <p className="text-xl font-black tabular-nums sm:text-2xl">{allFolders.length}</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">Pastas</p>
                          </div>
                          <div className="px-2">
                            <p className="text-xl font-black tabular-nums text-accent sm:text-2xl">{allFolders.filter((folder) => folder.isVisible).length}</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">Visíveis</p>
                          </div>
                          <div className="px-2">
                            <p className="text-xl font-black tabular-nums sm:text-2xl">{customEquipment.length}</p>
                            <p className="mt-1 text-[10px] text-muted-foreground">Forjados</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)]">
                      {/* PASTAS: tudo que o mestre mais usa fica na mesma linha. */}
                      <div className="min-w-0 overflow-hidden rounded-[20px] border border-border/70 bg-foreground/[0.02]">
                        <div className="border-b border-border/60 p-5 sm:p-6">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">01 / Coleções</div>
                              <h3 className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
                                <FolderOpen className="size-5 text-accent" /> Gerenciar pastas
                              </h3>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Organize a vitrine e controle a visibilidade.</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-border/80 bg-background px-2.5 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground">{allFolders.length} total</span>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <label htmlFor="gm-new-folder" className="sr-only">Nome da nova pasta</label>
                            <div className="relative min-w-0 flex-1">
                              <FolderPlus className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                              <input
                                id="gm-new-folder"
                                type="text"
                                placeholder="Ex.: Artefatos raros"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder() }}
                                className="h-11 w-full rounded-xl border border-border/80 bg-background pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none transition-colors focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
                              />
                            </div>
                            <Button
                              type="button"
                              onClick={handleCreateFolder}
                              className="h-11 shrink-0 rounded-xl bg-accent px-5 font-bold text-black hover:bg-accent/90"
                            >
                              <Plus className="mr-2 size-4" /> Nova pasta
                            </Button>
                          </div>
                        </div>
                        <div className="max-h-[470px] space-y-2 overflow-y-auto p-3 custom-scrollbar-sepia sm:p-4">
                          {allFolders.map((folder) => {
                            // Conserva a persistência especial das pastas do sistema.
                            const dbFolder = storeFolders?.find((f) => f.id === folder.id)
                            const isVisible = folder.isVisible
                            const itemCount = customEquipment.filter((item) => (item.folderId || "custom") === folder.id).length
                            return (
                              <div key={folder.id} className="group rounded-2xl border border-border/70 bg-background/85 p-3 transition-colors hover:border-accent/30 sm:p-3.5">
                                <div className="flex min-w-0 items-center gap-3">
                                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${isVisible ? "border-accent/20 bg-accent/10 text-accent" : "border-border/70 bg-foreground/[0.04] text-muted-foreground"}`}>
                                    <FolderOpen className="size-4.5" />
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-extrabold text-foreground" title={folder.name}>{folder.name}</p>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                      {folder.isSystem ? "Pasta do sistema" : "Pasta personalizada"} · {itemCount} {itemCount === 1 ? "item forjado" : "itens forjados"}
                                    </p>
                                  </div>
                                  <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold sm:inline-flex ${isVisible ? "bg-accent/10 text-accent" : "bg-foreground/[0.055] text-muted-foreground"}`}>
                                    {isVisible ? "Visível" : "Oculta"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (folder.isSystem && !dbFolder) {
                                        onCreateFolder({ ...folder, isVisible: !isVisible })
                                      } else {
                                        onUpdateFolder(folder.id, { isVisible: !isVisible })
                                      }
                                    }}
                                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isVisible ? "border-accent/25 bg-accent/10 text-accent hover:bg-accent/20" : "border-border/80 bg-foreground/[0.04] text-muted-foreground hover:text-foreground"}`}
                                    title={isVisible ? "Esconder dos jogadores" : "Mostrar para jogadores"}
                                    aria-label={`${isVisible ? "Ocultar" : "Mostrar"} pasta ${folder.name} para os jogadores`}
                                    aria-pressed={isVisible}
                                  >
                                    {isVisible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                                  </button>
                                  {!folder.isSystem && (
                                    <button
                                      type="button"
                                      onClick={() => onDeleteFolder(folder.id)}
                                      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-foreground/[0.025] text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                                      title="Excluir pasta"
                                      aria-label={`Excluir pasta ${folder.name}`}
                                    >
                                      <Trash2 className="size-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex items-center gap-2 border-t border-border/60 px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
                          <Eye className="size-3.5 shrink-0 text-accent" />
                          O ícone de olho controla o que aparece para os jogadores.
                        </div>
                      </div>

                      {/* ORGANIZADOR: busca, filtro e destino, sem novos callbacks. */}
                      <div className="min-w-0 overflow-hidden rounded-[20px] border border-border/70 bg-foreground/[0.02]">
                        <div className="border-b border-border/60 p-5 sm:p-6">
                          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">02 / Inventário da loja</div>
                              <h3 className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
                                <ArrowRightLeft className="size-5 text-accent" /> Organizar itens
                              </h3>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Escolha uma pasta de destino para cada item forjado.</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-border/80 bg-background px-2.5 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground">{customEquipment.length} itens</span>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(140px,0.75fr)]">
                            <div className="relative min-w-0">
                              <label htmlFor="gm-store-search" className="sr-only">Pesquisar item forjado</label>
                              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                              <input
                                id="gm-store-search"
                                type="search"
                                placeholder="Buscar item..."
                                value={storeItemSearch}
                                onChange={(e) => setStoreItemSearch(e.target.value)}
                                className="h-10 w-full rounded-xl border border-border/80 bg-background pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
                              />
                            </div>
                            <label className="sr-only" htmlFor="gm-store-filter">Filtrar itens por pasta</label>
                            <select
                              id="gm-store-filter"
                              value={storeFolderFilter}
                              onChange={(e) => setStoreFolderFilter(e.target.value)}
                              className="h-10 min-w-0 rounded-xl border border-border/80 bg-background px-3 text-xs text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
                            >
                              <option value="all">Todas as pastas</option>
                              {customDestinationFolders.map((folder) => (
                                <option key={folder.id} value={folder.id}>{folder.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="max-h-[470px] space-y-2 overflow-y-auto p-3 custom-scrollbar-sepia sm:p-4">
                          {customEquipment.length === 0 ? (
                            <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-background/60 p-6 text-center">
                              <Package className="mb-3 size-8 text-accent/60" />
                              <h4 className="text-sm font-bold">Nenhum item forjado</h4>
                              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">Os equipamentos criados em “Forjar item” poderão ser organizados aqui.</p>
                            </div>
                          ) : visibleStoreItems.length === 0 ? (
                            <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 p-6 text-center">
                              <Search className="mb-2 size-6 text-muted-foreground" />
                              <p className="text-sm font-semibold">Nenhum item neste filtro.</p>
                              <p className="mt-1 text-xs text-muted-foreground">Tente buscar por outro nome ou pasta.</p>
                            </div>
                          ) : (
                            visibleStoreItems.map((item) => (
                              <div key={item.id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border/70 bg-background/85 p-3 transition-colors hover:border-accent/30 sm:flex-row sm:items-center sm:gap-3.5">
                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                  {itemImageUrl(item.imageUrl) ? (
                                    <ItemArtwork name={item.name} imageUrl={item.imageUrl} className="size-11 shrink-0" />
                                  ) : (
                                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-foreground/[0.04] text-accent"><Package className="size-5" /></span>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold text-foreground" title={item.name}>{item.name}</p>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">Equipamento personalizado</p>
                                  </div>
                                </div>
                                <div className="min-w-0 sm:w-[170px] sm:shrink-0">
                                  <label htmlFor={`gm-item-folder-${item.id}`} className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pasta</label>
                                  <select
                                    id={`gm-item-folder-${item.id}`}
                                    value={item.folderId || "custom"}
                                    onChange={(e) => onMoveCustomItem(item.id, e.target.value)}
                                    className="h-9 w-full min-w-0 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-semibold text-foreground outline-none transition-colors hover:border-accent/40 focus:border-accent focus:ring-2 focus:ring-accent/15"
                                  >
                                    {customDestinationFolders.map((folder) => (
                                      <option key={folder.id} value={folder.id}>{folder.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="flex items-start gap-2 border-t border-border/60 px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
                          <Info className="mt-0.5 size-3.5 shrink-0 text-accent" />
                          Itens do sistema permanecem fixos. Somente equipamentos personalizados podem ser movidos.
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>
            </div>

            {/* FOOTER */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-foreground/[0.015] px-5 py-3.5 sm:px-8 sm:py-4">
              <span className="hidden min-w-0 items-center gap-2 text-[11px] text-muted-foreground sm:flex">
                <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                <span className="truncate">{gmPanelTab === "catalog"
                  ? selectedCatalogItem
                    ? `${selectedCatalogItem.name} → ${characters.find((c) => c.id === selectedTargetCharId)?.name || activeCreatures.find((c) => c.instanceId === selectedTargetCharId)?.name || "Selecione um destinatário"}`
                    : "Selecione um item para preparar a entrega"
                  : "Alterações aplicadas pelos controles de cada seção"}</span>
              </span>
              <Button
                variant="ghost"
                className="rounded-xl text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                onClick={onClose}
              >
                Fechar painel
              </Button>
              {(["catalog", "custom", "zenits"] as const).some((tab) => tab === gmPanelTab) && (
                <Button
                  size="lg"
                  className="gap-2 bg-accent text-black hover:bg-accent/90 font-bold px-8 shadow-[0_0_20px_rgba(var(--accent-rgb, 212,175,55),0.3)] transition-all disabled:opacity-50 disabled:shadow-none"
                  disabled={
                    (!selectedLoot && gmPanelTab === "catalog") ||
                    (!zenitAmount && gmPanelTab === "zenits") ||
                    !selectedTargetCharId ||
                    sendingLoot
                  }
                  onClick={handleGiveLoot}
                >
                  {sendingLoot ? (
                    <span className="animate-pulse flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" /> Enviando...
                    </span>
                  ) : (
                    <>
                      <Send className="size-4" />{" "}
                      {gmPanelTab === "custom"
                        ? "Entregar"
                        : gmPanelTab === "zenits"
                          ? "Enviar Dinheiro"
                          : "Entregar Item"}
                    </>
                  )}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
