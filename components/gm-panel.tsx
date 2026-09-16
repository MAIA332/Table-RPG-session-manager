"use client"
import { normalizeStoreFolders } from "@/lib/store-folders"

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
} from "lucide-react"

import { ItemWeightField } from "./item-weight-field"
import { weightFields, type ItemWeight } from "@/lib/inventory-weight"
import { ItemActionsEditor } from "./inventory-equipment"
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
  isOpen: boolean
  onClose: () => void
  characters: Character[]
  activeCreatures: ActiveCreature[]
  members: Member[]
  customEquipment: any[]
  customClasses: any[]
  onCreateEquipment: (eq: any) => void | Promise<void>
  onDeleteEquipment: (id: string) => void
  onCreateClass: (cls: any) => void
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
        ${
          expanded
            ? "border-amber-600/40 bg-amber-600/[0.04]"
            : "border-white/5 bg-black/40 hover:border-white/15"
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
            <div className="p-4 pt-1 border-t border-white/5 space-y-4">
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
                    className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-amber-600/50"
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
                    className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-center outline-none focus:border-amber-600/50"
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
                  className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-xs leading-relaxed resize-none outline-none focus:border-amber-600/50"
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
                      ${
                        skill.action
                          ? "border-blue-400 bg-blue-400"
                          : "border-white/20"
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
                        className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono outline-none"
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
                        className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none"
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
                        className="rounded-lg border border-white/5 bg-black/30"
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
                                className="relative rounded-lg border border-purple-500/10 bg-[#111] p-3 space-y-2"
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
                                    className="flex-1 bg-black/50 border border-white/10 rounded px-2 py-1.5 text-xs font-bold outline-none focus:border-purple-500/40"
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
                                  className="w-full bg-black/50 border border-white/10 rounded px-2 py-1.5 text-[11px] resize-none outline-none focus:border-purple-500/40"
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
    "catalog" | "custom" | "zenits" | "classes" | "hazards" | "store-config"
  >("catalog")
  const [zenitAmount, setZenitAmount] = useState<number | "">("")
  const [selectedLoot, setSelectedLoot] = useState<string | null>(null)
  const [selectedTargetCharId, setSelectedTargetCharId] = useState<
    string | null
  >(null)
  const [sendingLoot, setSendingLoot] = useState(false)
  const [lootSearchQuery, setLootSearchQuery] = useState("")
  const [newFolderName, setNewFolderName] = useState("")

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

  const [classDraft, setClassDraft] = useState<GameClass>({
    id: "",
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
  const filteredLoot = allLoot.filter(
    (item) =>
      item.name.toLowerCase().includes(lootSearchQuery.toLowerCase()) ||
      item.detail.toLowerCase().includes(lootSearchQuery.toLowerCase()),
  )

  function CreatedClassCard({
    cls,
    expanded,
    onToggle,
    onDelete,
  }: {
    cls: GameClass
    expanded: boolean
    onToggle: () => void
    onDelete: () => void
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
        ${
          expanded
            ? "border-amber-500/40 bg-amber-500/[0.04]"
            : "border-white/10 bg-black/40 hover:border-white/20"
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
                  Homebrew
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
              <div className="border-t border-white/5 p-4 space-y-5">
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
                        className="rounded-xl border border-white/5 bg-black/40 overflow-hidden"
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
                              <span className="text-[8px] font-mono px-2 py-1 rounded bg-white/5 text-muted-foreground">
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

                                <span className="text-[10px] uppercase px-2 py-1 rounded bg-white/5 text-muted-foreground">
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
                                              className="rounded-lg border border-purple-500/10 bg-black/30 p-2.5"
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
                      <div className="py-8 text-center border border-dashed border-white/10 rounded-xl">
                        <GraduationCap className="size-7 mx-auto mb-2 text-muted-foreground opacity-30" />
                        <p className="text-xs text-muted-foreground">
                          Esta classe não possui habilidades.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ID TÉCNICO */}
                <div className="pt-2 border-t border-white/5 flex justify-between gap-3">
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

    const actions = Array.isArray(sysDraft.actions) ? sysDraft.actions : []
    try {
      actions.forEach((action: any) => validateItemAction(action))
    } catch (error) {
      return alert(
        error instanceof Error ? error.message : "Revise as ações do item.",
      )
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
      actions,
      id:
        sysDraft.id ||
        "custom-eq-" + Math.random().toString(36).substring(2, 10),
      name: sysDraft.name,
      category: sysDraft.category,
      cost: Number(sysDraft.cost),
      purchasable: String(sysDraft.purchasable) === "true",
      detail: sysDraft.detail,
      damage: sysDraft.damage,
      defense: sysDraft.defense,
      mdef: sysDraft.mdef,
      type: sysDraft.type,
      bonus: sysDraft.bonus,
      effect: sysDraft.effect,

      // Todo item custom começa na pasta CUSTOM
      folderId: sysDraft.folderId || "custom",
    }
    setSavingEquipment(true)
    try {
      await onCreateEquipment(newEq)
      setSysDraft({
        name: "",
        category: "weapon",
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

  function handleSaveClass() {
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

    if (validSkills.length === 0) {
      return alert("A classe precisa ter pelo menos 1 habilidade válida.")
    }

    const newClass: GameClass = {
      id: "custom-class-" + Math.random().toString(36).substring(2, 10),

      name: classDraft.name.trim(),
      archetype: classDraft.archetype.trim(),
      description: classDraft.description.trim(),

      hpPerLevel: Number(classDraft.hpPerLevel),
      mpPerLevel: Number(classDraft.mpPerLevel),
      primaryAttribute: classDraft.primaryAttribute,

      skills: validSkills.map((skill) => ({
        ...skill,

        id: "cskill-" + Math.random().toString(36).substring(2, 8),

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

    onCreateClass(newClass)

    setClassDraft({
      id: "",
      name: "",
      archetype: "",
      description: "",
      hpPerLevel: 5,
      mpPerLevel: 5,
      primaryAttribute: "mig",
      skills: [createSkillDraft()],
    })

    setExpandedSkillId(null)

    alert("Classe criada! Jogadores agora poderão escolhê-la.")
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 overflow-hidden"
        >
          <motion.div
            variants={modalVariants}
            className="rpg-modal relative flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden border border-accent/30 bg-[#0a0a0a]"
          >
            <div className="flex justify-between items-center p-6 border-b border-white/5 bg-black/60 shrink-0 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent/50 to-transparent"></div>
              <div>
                <h4 className="font-serif text-2xl font-black flex items-center gap-3">
                  <Gift className="size-6 text-accent" />{" "}
                  <span className="text-foreground">Baú do mestre</span>
                </h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Forje relíquias, armas de sistema ou construa classes
                  homebrew.
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 bg-white/5 hover:bg-white/10 transition-colors border border-white/5"
              >
                <X className="size-5 text-muted-foreground hover:text-white" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto custom-scrollbar-sepia flex-1 flex flex-col gap-8 relative">
              <div className="flex bg-black/50 rounded-xl p-1.5 border border-white/5 w-full mx-auto max-w-2xl shrink-0 shadow-inner overflow-x-auto">
                <button
                  onClick={() => {
                    setGmPanelTab("catalog")
                    setSelectedLoot(null)
                  }}
                  className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === "catalog" ? "bg-accent text-black shadow-md" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}
                >
                  Catálogo
                </button>
                <button
                  onClick={() => {
                    setGmPanelTab("custom")
                    setSelectedLoot(null)
                  }}
                  className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === "custom" ? "bg-accent text-black shadow-md" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}
                >
                  Forjar Item
                </button>
                <button
                  onClick={() => {
                    setGmPanelTab("classes")
                    setSelectedLoot(null)
                  }}
                  className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === "classes" ? "bg-amber-600 text-black shadow-md" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}
                >
                  Classes (Homebrew)
                </button>
                <button
                  onClick={() => {
                    setGmPanelTab("zenits")
                    setSelectedLoot(null)
                  }}
                  className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === "zenits" ? "bg-accent text-black shadow-md" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}
                >
                  Dar Dinheiro
                </button>
                <button
                  onClick={() => {
                    setGmPanelTab("hazards")
                    setSelectedLoot(null)
                  }}
                  className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === "hazards" ? "bg-red-900 text-white shadow-md" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}
                >
                  Ameaças
                </button>
                <button
                  onClick={() => {
                    setGmPanelTab("store-config")
                    setSelectedLoot(null)
                  }}
                  className={`flex-1 text-xs sm:text-sm px-3 py-2.5 rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${gmPanelTab === "store-config" ? "bg-indigo-600 text-white shadow-md" : "text-muted-foreground hover:text-white hover:bg-white/5"}`}
                >
                  Loja & Pastas
                </button>
              </div>

              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-3">
                  <h5 className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-2">
                    <span className="bg-accent text-black size-5 flex items-center justify-center rounded-full">
                      1
                    </span>
                    {gmPanelTab === "catalog"
                      ? "Escolha o Item"
                      : gmPanelTab === "custom"
                        ? "O Que Deseja Forjar?"
                        : gmPanelTab === "classes"
                          ? "Forjar Classe de Jogador"
                          : "Quantidade de Zenits"}
                  </h5>

                  {gmPanelTab === "catalog" ? (
                    <div className="bg-black/40 border border-white/5 rounded-xl p-4 shadow-inner">
                      <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Buscar no compêndio..."
                          value={lootSearchQuery}
                          onChange={(e) => setLootSearchQuery(e.target.value)}
                          className="w-full bg-[#111] border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all"
                        />
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar-sepia">
                        {filteredLoot.map((item) => {
                          const isSelected = selectedLoot === item.id
                          const isCustom = item.id.startsWith("custom-eq-")
                          return (
                            <div key={item.id} className="relative group/card">
                              <button
                                onClick={() =>
                                  setSelectedLoot(isSelected ? null : item.id)
                                }
                                className={`w-full flex flex-col text-left p-4 rounded-xl border transition-all duration-300 overflow-hidden ${isSelected ? "border-accent bg-accent/5 shadow-[0_0_20px_rgba(var(--accent-rgb, 212,175,55),0.1)]" : "border-white/5 bg-[#161616] hover:border-white/20 hover:bg-[#1a1a1a]"}`}
                              >
                                <div className="flex justify-between items-start w-full gap-2">
                                  <div className="flex flex-col items-start gap-1.5">
                                    <p
                                      className={`font-bold text-sm transition-colors ${isSelected ? "text-accent" : "text-foreground"}`}
                                    >
                                      {item.name}
                                    </p>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {isCustom && (
                                        <span className="text-[9px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 uppercase tracking-widest">
                                          Custom
                                        </span>
                                      )}
                                      {item.type && (
                                        <span className="text-[9px] bg-black/60 text-muted-foreground px-2 py-0.5 rounded-full border border-white/5 uppercase tracking-widest">
                                          {item.type}
                                        </span>
                                      )}
                                      {item.purchasable === false && (
                                        <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                                          Oculto
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] font-mono text-accent/80 border border-accent/20 px-2 py-1 rounded-md bg-accent/5">
                                      {item.cost}z
                                    </span>
                                    <ChevronDown
                                      className={`size-4 text-muted-foreground transition-transform duration-300 ${isSelected ? "rotate-180 text-accent" : ""}`}
                                    />
                                  </div>
                                </div>

                                <AnimatePresence>
                                  {isSelected && (
                                    <motion.div
                                      initial={{
                                        opacity: 0,
                                        height: 0,
                                        marginTop: 0,
                                      }}
                                      animate={{
                                        opacity: 1,
                                        height: "auto",
                                        marginTop: 16,
                                      }}
                                      exit={{
                                        opacity: 0,
                                        height: 0,
                                        marginTop: 0,
                                      }}
                                      className="border-t border-accent/20 pt-4 flex flex-col gap-3 w-full"
                                    >
                                      <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                        {item.detail || "Sem descrição."}
                                      </p>
                                      <div className="flex flex-wrap gap-2 mt-1">
                                        {item.damage && (
                                          <span className="text-[10px] font-mono bg-destructive/10 text-red-300 px-2 py-1 rounded border border-destructive/20">
                                            Dano: {item.damage}
                                          </span>
                                        )}
                                        {item.defense && (
                                          <span className="text-[10px] font-mono bg-blue-500/10 text-blue-300 px-2 py-1 rounded border border-blue-500/20">
                                            DEF: {item.defense}
                                          </span>
                                        )}
                                        {item.mdef && (
                                          <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded border border-indigo-500/20">
                                            M.DEF: {item.mdef}
                                          </span>
                                        )}
                                        {item.bonus && (
                                          <span className="text-[10px] font-mono bg-green-500/10 text-green-300 px-2 py-1 rounded border border-green-500/20">
                                            Bônus: {item.bonus}
                                          </span>
                                        )}
                                        {item.effect && (
                                          <span className="text-[10px] font-mono bg-amber-500/10 text-amber-300 px-2 py-1 rounded border border-amber-500/20">
                                            Efeito: {item.effect}
                                          </span>
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </button>

                              {isCustom && (
                                <div className="mt-2 flex items-center justify-end gap-2 px-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSysDraft({
                                        ...item,
                                        actions: getItemActions(item),
                                      })
                                      setCreationMode("system")
                                      setGmPanelTab("custom")
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                    aria-label={`Editar ${item.name}`}
                                  >
                                    <Pencil className="size-3.5 shrink-0" />{" "}
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeleteEquipment(item.id)
                                      if (selectedLoot === item.id)
                                        setSelectedLoot(null)
                                    }}
                                    className="inline-flex items-center justify-center rounded-lg border border-border/40 p-2 text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
                                    aria-label={`Excluir ${item.name}`}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {filteredLoot.length === 0 && (
                          <div className="col-span-2 py-8 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-white/5 rounded-xl">
                            <Package className="size-8 opacity-20 mb-2" />
                            <p className="text-sm">Nenhum item encontrado.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : gmPanelTab === "custom" ? (
                    <div className="flex flex-col gap-4 border border-white/5 rounded-xl p-5 bg-black/40 shadow-inner">
                      <div className="flex gap-2 p-1 bg-black/50 border border-white/10 rounded-lg">
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
                            className="w-full bg-[#111] border border-white/10 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/50 transition-all"
                          />
                          <select
                            value={customItemType}
                            onChange={(e) =>
                              setCustomItemType(e.target.value as any)
                            }
                            className="w-full bg-[#111] border border-white/10 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-all"
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
                              className="w-full bg-[#111] border border-white/10 rounded-lg py-3 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-all custom-scrollbar-sepia resize-none"
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
                              className="w-full bg-[#111] border border-white/10 rounded-lg py-2.5 px-4 text-sm text-foreground focus:outline-none focus:border-purple-500/50 transition-all"
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
                              className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none focus:border-accent/50"
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
                                })
                              }
                              className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none focus:border-accent/50"
                            >
                              <option value="weapon">Arma</option>
                              <option value="armor">Armadura</option>
                              <option value="shield">Escudo</option>
                              <option value="accessory">Acessório</option>
                            </select>
                          </label>
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
                              className="bg-[#111] border border-white/10 rounded p-2 text-sm font-mono outline-none focus:border-accent/50"
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
                              className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none focus:border-accent/50"
                            >
                              <option value="true">Sim (Visível)</option>
                              <option value="false">Não (Loot Oculto)</option>
                            </select>
                          </label>
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
                              className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none resize-none focus:border-accent/50 custom-scrollbar-sepia"
                              placeholder="[BÔNUS: +1 Dano]\n[MODIFICADOR: Precisão usa DES+VIG]"
                            />
                          </label>

                          <div className="col-span-2 border-t border-white/5 pt-3 mt-1 grid grid-cols-3 gap-3">
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
                              className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none"
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
                              className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none font-mono"
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
                              className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none"
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
                              className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none font-mono"
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
                              className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none font-mono"
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
                              className="bg-[#111] border border-white/10 rounded p-2 text-xs outline-none"
                            />
                          </div>

                          <div className="col-span-2">
                            <ItemActionsEditor
                              actions={sysDraft.actions || []}
                              onChange={(actions) =>
                                setSysDraft({ ...sysDraft, actions })
                              }
                            />
                          </div>
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
                      <div className="rounded-2xl border border-purple-500/20 bg-black/30 overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-purple-500/[0.03]">
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
                            <div className="py-10 flex flex-col items-center justify-center text-center border border-dashed border-white/10 rounded-xl">
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

                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-white/5" />

                        <span className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground font-black">
                          Nova Classe
                        </span>

                        <div className="h-px flex-1 bg-white/5" />
                      </div>

                      {/* CABEÇALHO DA CLASSE */}
                      <div className="rounded-2xl border border-amber-600/30 bg-black/40 overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-amber-600/[0.03]">
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
                                className="bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-amber-600/50"
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
                                className="bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-amber-600/50"
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
                              className="bg-[#111] border border-white/10 rounded-lg px-3 py-2.5 text-sm resize-none outline-none focus:border-amber-600/50"
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
                                className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 font-mono text-sm"
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
                                className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 font-mono text-sm"
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
                                className="bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm"
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
                      <div className="rounded-2xl border border-amber-600/20 bg-black/30 overflow-hidden">
                        <div className="p-4 flex items-center justify-between border-b border-white/5">
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
                      <div className="rounded-2xl border border-white/5 bg-black/30 p-4">
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
                                className="rounded-lg bg-black/40 border border-white/5 p-3"
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
                        onClick={handleSaveClass}
                      >
                        <Save className="size-4 mr-2" />
                        Oficializar Classe
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 border border-white/5 rounded-xl p-5 bg-black/40 shadow-inner">
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
                          className="w-full bg-[#111] border border-white/10 rounded-lg py-4 pl-12 pr-4 text-xl font-mono font-bold text-accent placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all"
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

                {/* PASSO 2: PARA QUEM? (Não aparece na aba de Classes) */}
                {gmPanelTab !== "classes" && (
                  <div
                    className={`flex flex-col gap-3 transition-opacity duration-300 ${selectedLoot || (gmPanelTab === "custom" && creationMode === "relic") || gmPanelTab === "zenits" ? "opacity-100" : "opacity-40 pointer-events-none"}`}
                  >
                    <h5 className="text-[10px] font-black uppercase tracking-widest text-accent flex items-center gap-2">
                      <span className="bg-accent text-black size-5 flex items-center justify-center rounded-full">
                        2
                      </span>
                      Destinatário (Inventário)
                    </h5>

                    <div className="grid gap-3 sm:grid-cols-3 bg-black/40 border border-white/5 rounded-xl p-4 shadow-inner max-h-[200px] overflow-y-auto custom-scrollbar-sepia">
                      {characters.map((c) => {
                        const owner = members.find(
                          (m) => m.userId === c.ownerId,
                        )
                        const isSelected = selectedTargetCharId === c.id
                        return (
                          <button
                            key={c.id}
                            onClick={() => setSelectedTargetCharId(c.id)}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${isSelected ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.15)]" : "border-white/5 bg-[#161616] hover:border-white/20 hover:bg-[#1a1a1a]"}`}
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
                          </button>
                        )
                      })}

                      {gmPanelTab === "catalog" &&
                        activeCreatures.map((c) => (
                          <button
                            key={c.instanceId}
                            onClick={() =>
                              setSelectedTargetCharId(c.instanceId)
                            }
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${selectedTargetCharId === c.instanceId ? "border-destructive bg-destructive/10 shadow-[0_0_15px_rgba(255,0,0,0.15)]" : "border-white/5 bg-[#161616] hover:border-destructive/30 hover:bg-[#1a1a1a]"}`}
                          >
                            <div
                              className={`size-10 rounded-full border overflow-hidden shrink-0 ${selectedTargetCharId === c.instanceId ? "border-destructive" : "border-white/10"}`}
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
                              <p className="text-[9px] text-destructive/60 uppercase tracking-widest mt-0.5 truncate w-full text-left">
                                Na Mesa
                              </p>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {gmPanelTab === "store-config" && (
                  <div className="grid lg:grid-cols-2 gap-6">
                    {/* Coluna 1: Gerenciar Pastas */}
                    <div className="bg-black/40 border border-white/5 rounded-xl p-5 shadow-inner">
                      <h3 className="text-sm font-bold text-indigo-400 mb-4 flex items-center gap-2">
                        <FolderOpen className="size-4" /> Pastas da Loja
                      </h3>

                      <div className="flex gap-2 mb-4">
                        <input
                          type="text"
                          placeholder="Nome da nova pasta..."
                          value={newFolderName}
                          onChange={(e) => setNewFolderName(e.target.value)}
                          className="flex-1 bg-[#111] border border-white/10 rounded-lg py-2 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-indigo-500/50"
                        />
                        <Button
                          onClick={handleCreateFolder}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                          <FolderPlus className="size-4 mr-2" /> Criar
                        </Button>
                      </div>

                      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar-sepia pr-2">
                        {allFolders.map((folder) => {
                          // O estado de visibilidade das pastas de sistema pode ser sobrescrito pelo BD
                          const dbFolder = storeFolders?.find(
                            (f) => f.id === folder.id,
                          )
                          const isVisible = folder.isVisible

                          return (
                            <div
                              key={folder.id}
                              className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-[#161616]"
                            >
                              <div>
                                <p className="text-sm font-bold text-white">
                                  {folder.name}
                                </p>
                                {folder.isSystem && (
                                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                    Pasta de Sistema
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    if (folder.isSystem && !dbFolder) {
                                      // Se for sistema e ainda não existe no BD, cria para salvar o estado de visibility
                                      onCreateFolder({
                                        ...folder,
                                        isVisible: !isVisible,
                                      })
                                    } else {
                                      onUpdateFolder(folder.id, {
                                        isVisible: !isVisible,
                                      })
                                    }
                                  }}
                                  className={`p-2 rounded-md transition-colors ${isVisible ? "text-green-400 bg-green-400/10 hover:bg-green-400/20" : "text-red-400 bg-red-400/10 hover:bg-red-400/20"}`}
                                  title={
                                    isVisible
                                      ? "Esconder dos jogadores"
                                      : "Mostrar para jogadores"
                                  }
                                >
                                  {isVisible ? (
                                    <Eye className="size-4" />
                                  ) : (
                                    <EyeOff className="size-4" />
                                  )}
                                </button>
                                {!folder.isSystem && (
                                  <button
                                    onClick={() => onDeleteFolder(folder.id)}
                                    className="p-2 rounded-md text-destructive hover:bg-destructive/10 transition-colors"
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

                    {/* Coluna 2: Mover Itens (Apenas Custom) */}
                    <div className="bg-black/40 border border-white/5 rounded-xl p-5 shadow-inner">
                      <h3 className="text-sm font-bold text-accent mb-4 flex items-center gap-2">
                        <ArrowRightLeft className="size-4" /> Organizar Itens
                        (Custom)
                      </h3>
                      <p className="text-xs text-muted-foreground mb-4">
                        Os itens base (SISTEMA) são fixos. Apenas itens forjados
                        (CUSTOM) podem ser movidos.
                      </p>

                      <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar-sepia pr-2">
                        {customEquipment.length === 0 ? (
                          <p className="text-sm text-center text-muted-foreground p-4 italic">
                            Nenhum equipamento customizado forjado.
                          </p>
                        ) : (
                          customEquipment.map((item) => (
                            <div
                              key={item.id}
                              className="p-3 rounded-lg border border-white/5 bg-[#161616] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm text-white truncate">
                                  {item.name}
                                </p>
                              </div>
                              <select
                                value={item.folderId || "custom"}
                                onChange={(e) =>
                                  onMoveCustomItem(item.id, e.target.value)
                                }
                                className="bg-[#0a0a0a] border border-white/10 text-xs text-white rounded p-1.5 focus:outline-none focus:border-accent"
                              >
                                {customDestinationFolders.map((folder) => (
                                  <option key={folder.id} value={folder.id}>
                                    {folder.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* FOOTER */}
            <div className="p-6 border-t border-white/5 bg-black/60 flex justify-between gap-4 shrink-0 relative overflow-hidden">
              <Button
                variant="ghost"
                className="text-muted-foreground hover:text-white"
                onClick={onClose}
              >
                Cancelar
              </Button>
              {gmPanelTab !== "classes" && (
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
