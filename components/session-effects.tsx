"use client"

import { Hand } from "lucide-react"
import type { CSSProperties } from "react"

export interface DicePresentation {
  id: string
  characterName: string
  playerName: string
  attribute: string
  result: string | number
  dice: number[]
  breakdown?: string
  modifier?: number
}

export interface DiceRollDetails {
  breakdown?: string
  modifier?: number
}

export interface HandPresentation {
  id: string
  characterName: string
  playerName: string
}

function seedFrom(value: string) {
  let seed = 0
  for (let index = 0; index < value.length; index += 1) seed = ((seed << 5) - seed + value.charCodeAt(index)) | 0
  return Math.abs(seed)
}

export function getDiceFromLabel(label: string): number[] {
  const dice = Array.from(label.matchAll(/\bd(4|6|8|10|12|20|100)\b/gi), (match) => Number(match[1]))
  return dice.length > 0 ? dice.slice(0, 6) : [6, 8]
}

export function formatRollLabel(label: string): string {
  return label.replace(/[🎲⚡]/gu, "").replace(/\s+/g, " ").replace(/\s+Mod:/g, " · Mod:").trim()
}

export function DiceRollPresentation({ effect }: { effect: DicePresentation }) {
  const seed = seedFrom(effect.id)
  const dice = effect.dice.length > 0 ? effect.dice : [6, 8]

  return (
    <div className="session-dice-layer" aria-live="polite">
      <div className="session-dice-field" aria-hidden="true">
        {dice.map((sides, index) => {
          const left = 14 + ((seed + index * 29) % 72)
          const delay = ((seed + index * 11) % 24) / 100
          const drift = ((seed + index * 17) % 25) - 12
          const rotation = 180 + ((seed + index * 47) % 420)
          return (
            <div
              key={`${effect.id}-${index}`}
              className="session-die-fall"
              style={{
                left: `${left}%`,
                animationDelay: `${delay}s`,
                "--dice-drift": `${drift}vw`,
                "--dice-rotation": `${rotation}deg`,
              } as CSSProperties}
            >
              <div className="session-die" data-sides={sides}><span>d{sides}</span></div>
              <span className="session-die-shadow" />
            </div>
          )
        })}
      </div>
      <div className="session-roll-result">
        <span className="session-effect-kicker">Rolagem de {effect.playerName}</span>
        <strong>{effect.characterName}</strong>
        <span className="session-roll-detail">{formatRollLabel(effect.attribute)}</span>
        <span className="session-roll-value">{effect.result}</span>
        {(effect.breakdown || effect.modifier) && (
          <span className="session-roll-breakdown">
            {effect.breakdown && <span>{effect.breakdown}</span>}
            {effect.breakdown && effect.modifier ? <span aria-hidden="true">·</span> : null}
            {effect.modifier ? <span className={effect.modifier < 0 ? "is-negative" : "is-positive"}>Mod: {effect.modifier > 0 ? "+" : ""}{effect.modifier}</span> : null}
          </span>
        )}
      </div>
    </div>
  )
}

export function HandRaisePresentation({ effect }: { effect: HandPresentation }) {
  const hasCharacterName = effect.characterName && effect.characterName !== effect.playerName

  return (
    <div className="session-hand-layer" aria-live="assertive">
      <div className="session-hand-alert">
        <div className="session-hand-seal">
          <Hand className="session-hand-icon" strokeWidth={1.5} />
        </div>
        <div className="session-hand-copy">
          <span className="session-effect-kicker">Pediu a palavra</span>
          <strong>{effect.characterName || effect.playerName}</strong>
          {hasCharacterName && <span>Jogador: {effect.playerName}</span>}
        </div>
      </div>
    </div>
  )
}
