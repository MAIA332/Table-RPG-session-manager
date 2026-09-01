"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Wind, Droplets, Play, Square, Minus, Plus, Send, AlertTriangle, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Character } from "@/lib/types"

export interface HazardState {
    active: boolean
    current: number
    max: number
}

interface ConditionManagerProps {
    onSyncCondition: (type: "oxygen" | "bleeding" | "reaction", state: HazardState) => void
}

export interface HazardData {
    id: string
    type: "oxygen" | "bleeding" | "reaction"
    endTime: number
    duration: number
    targetCharacterIds: string[] | null
}

export function HazardBanner({ hazard }: { hazard: HazardData }) {
    const [timeLeft, setTimeLeft] = useState(() => Math.max(0, hazard.endTime - Date.now()))

    useEffect(() => {
        const interval = setInterval(() => {
            const remaining = Math.max(0, hazard.endTime - Date.now())
            setTimeLeft(remaining)
            if (remaining === 0) clearInterval(interval)
        }, 1000)
        return () => clearInterval(interval)
    }, [hazard.endTime])

    let Icon = Wind
    let colorClass = "text-cyan-400"
    let bgClass = "bg-cyan-950/40 border-cyan-500/50"
    let progressColor = "bg-cyan-500"
    let title = "Fôlego / Oxigênio"

    if (hazard.type === "bleeding") {
        Icon = Droplets
        colorClass = "text-red-500"
        bgClass = "bg-red-950/40 border-red-500/50"
        progressColor = "bg-red-600"
        title = "Sangramento Crítico"
    } else if (hazard.type === "reaction") {
        Icon = Timer
        colorClass = "text-yellow-500"
        bgClass = "bg-yellow-950/40 border-yellow-500/50"
        progressColor = "bg-yellow-500"
        title = "Tempo de Reação"
    }

    const minutes = Math.floor(timeLeft / 60000)
    const seconds = Math.floor((timeLeft % 60000) / 1000)
    const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    const progressPercent = Math.min(100, (timeLeft / hazard.duration) * 100)

    return (
        <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className={`relative w-full border rounded-lg p-3 mb-4 shadow-lg overflow-hidden flex items-center gap-4 ${bgClass}`}
        >
            <div className={`p-2 rounded-md bg-black/50 ${colorClass}`}>
                <Icon className="size-6" />
            </div>

            <div className="flex-1 flex flex-col gap-1 z-10">
                <div className="flex justify-between items-end">
                    <h4 className={`font-bold uppercase tracking-wider text-xs ${colorClass}`}>
                        {title}
                    </h4>
                    <span className={`font-mono text-xl font-black ${timeLeft <= 10000 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                        {formattedTime}
                    </span>
                </div>

                <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
                    <motion.div
                        className={`h-full ${progressColor}`}
                        initial={{ width: "100%" }}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ ease: "linear", duration: 1 }}
                    />
                </div>
            </div>

            {timeLeft === 0 && (
                <div className="absolute inset-0 bg-red-950 flex items-center justify-center gap-2 z-20">
                    <AlertTriangle className="size-6 text-white animate-pulse" />
                    <span className="text-white font-bold uppercase tracking-widest text-lg drop-shadow-md">
                        Tempo Esgotado
                    </span>
                </div>
            )}
        </motion.div>
    )
}

interface GMHazardPanelProps {
    activeHazards: HazardData[]
    characters: Character[]
    onLaunch: (
        type: "oxygen" | "bleeding" | "reaction",
        minutes: number,
        targetCharacterIds: string[] | null
    ) => void
    onStop: (
        type: "oxygen" | "bleeding" | "reaction",
        targetCharacterIds: string[] | null
    ) => void
}

export function GMHazardPanel({
    activeHazards,
    characters,
    onLaunch,
    onStop
}: GMHazardPanelProps) {
    const [oxyInput, setOxyInput] = useState(5)
    const [bleedInput, setBleedInput] = useState(5)
    
    // Substituindo reactionInput único por dois estados: Minutos e Segundos
    const [reactionMin, setReactionMin] = useState(1)
    const [reactionSec, setReactionSec] = useState(0)

    const [targetCharacterId, setTargetCharacterId] = useState<string>("all")

    const selectedTargetIds =
        targetCharacterId === "all"
            ? null
            : [targetCharacterId]

    const findHazard = (type: "oxygen" | "bleeding" | "reaction") => {
        return activeHazards.find(hazard => {
            if (hazard.type !== type) return false
            if (hazard.targetCharacterIds === null) return selectedTargetIds === null
            if (selectedTargetIds === null) return false
            return hazard.targetCharacterIds.includes(targetCharacterId)
        })
    }

    const activeOxy = findHazard("oxygen")
    const activeBleed = findHazard("bleeding")
    const activeReaction = findHazard("reaction")

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* SELETOR DE ALVO */}
            <div className="border border-primary/20 bg-black/40 rounded-xl p-4">
                <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
                        ALVO DA CONDIÇÃO
                    </span>

                    <select
                        value={targetCharacterId}
                        onChange={(e) => setTargetCharacterId(e.target.value)}
                        className="bg-[#111] border border-white/10 rounded p-2.5 text-sm text-white outline-none"
                    >
                        <option value="all">
                            Todos os personagens
                        </option>
                        {characters.map((character) => (
                            <option key={character.id} value={character.id}>
                                {character.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* CARD TEMPO DE REAÇÃO */}
            <div className={`border rounded-xl p-5 ${activeReaction ? "border-yellow-500/50 bg-yellow-950/20" : "border-white/5 bg-black/40"}`}>
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold flex items-center gap-2 text-yellow-500">
                        <Timer className="size-5" /> Tempo de Reação
                    </h4>
                    {activeReaction ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onStop("reaction", activeReaction.targetCharacterIds)}
                            className="text-red-400 border-red-500/30 hover:bg-red-500/20"
                        >
                            <Square className="size-3 mr-2" /> Parar
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" onClick={() =>
                            onLaunch(
                                "reaction",
                                reactionMin + (reactionSec / 60), // Converte a soma inteira para minutos
                                selectedTargetIds
                            )
                        } className="text-yellow-500 border-yellow-500/30">
                            <Play className="size-3 mr-2" /> Lançar
                        </Button>
                    )}
                </div>

                {activeReaction ? (
                    <div className="mt-4"><HazardBanner hazard={activeReaction} /></div>
                ) : (
                    <div className="flex gap-3">
                        <div className="flex flex-col gap-1.5 flex-1">
                            <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">MINUTOS</span>
                            <input
                                type="number"
                                min="0"
                                value={reactionMin}
                                onChange={(e) => setReactionMin(Number(e.target.value))}
                                className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none text-white w-full"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5 flex-1">
                            <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">SEGUNDOS</span>
                            <input
                                type="number"
                                min="0"
                                max="59"
                                value={reactionSec}
                                onChange={(e) => setReactionSec(Number(e.target.value))}
                                className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none text-white w-full"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* CARD FÔLEGO */}
            <div className={`border rounded-xl p-5 ${activeOxy ? "border-cyan-500/50 bg-cyan-950/20" : "border-white/5 bg-black/40"}`}>
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold flex items-center gap-2 text-cyan-400">
                        <Wind className="size-5" /> Fôlego / Oxigênio
                    </h4>
                    {activeOxy ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onStop("oxygen", activeOxy.targetCharacterIds)}
                            className="text-red-400 border-red-500/30 hover:bg-red-500/20"
                        >
                            <Square className="size-3 mr-2" /> Parar
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" onClick={() =>
                            onLaunch(
                                "oxygen",
                                oxyInput,
                                selectedTargetIds
                            )
                        } className="text-cyan-400 border-cyan-500/30">
                            <Play className="size-3 mr-2" /> Lançar
                        </Button>
                    )}
                </div>

                {activeOxy ? (
                    <div className="mt-4"><HazardBanner hazard={activeOxy} /></div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">MÁXIMO (MINUTOS)</span>
                        <input
                            type="number"
                            value={oxyInput}
                            onChange={(e) => setOxyInput(Number(e.target.value))}
                            className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none text-white w-full"
                        />
                    </div>
                )}
            </div>

            {/* CARD SANGRAMENTO */}
            <div className={`border rounded-xl p-5 ${activeBleed ? "border-red-500/50 bg-red-950/20" : "border-white/5 bg-black/40"}`}>
                <div className="flex justify-between items-center mb-4">
                    <h4 className="font-bold flex items-center gap-2 text-red-500">
                        <Droplets className="size-5" /> Sangramento
                    </h4>
                    {activeBleed ? (
                        <Button size="sm" variant="outline" onClick={() => onStop("bleeding", activeBleed.targetCharacterIds)} className="text-red-400 border-red-500/30 hover:bg-red-500/20">
                            <Square className="size-3 mr-2" /> Parar
                        </Button>
                    ) : (
                        <Button size="sm" variant="outline" onClick={() =>
                            onLaunch(
                                "bleeding",
                                bleedInput,
                                selectedTargetIds
                            )
                        } className="text-red-500 border-red-500/30">
                            <Play className="size-3 mr-2" /> Lançar
                        </Button>
                    )}
                </div>

                {activeBleed ? (
                    <div className="mt-4"><HazardBanner hazard={activeBleed} /></div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">TEMPO ATÉ MORTE (MINUTOS)</span>
                        <input
                            type="number"
                            value={bleedInput}
                            onChange={(e) => setBleedInput(Number(e.target.value))}
                            className="bg-[#111] border border-white/10 rounded p-2 text-sm outline-none text-white w-full"
                        />
                    </div>
                )}
            </div>
        </div>
    )
}