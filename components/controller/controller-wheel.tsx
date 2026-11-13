'use client'
import type { InputSettings } from '@/lib/input/actions'
import { labelForPanelAction } from '@/lib/input/panel-actions'
import { ACTION_LABELS } from '@/lib/input/labels'
import { ControllerGlyph } from './controller-glyph'
import { targetOfAction, restoreTargetOfAction, characterBoundOfAction, type ControllerTarget } from '@/lib/input/targeted-actions'

interface Props {settings: InputSettings; page: number; skillNames?: string[]; skillChoices?: ControllerTarget[]; specialChoices?: ControllerTarget[]; characterChoices?: ControllerTarget[]; preview?: boolean}
export function ControllerWheel({settings, page, skillNames = [], skillChoices = [], specialChoices = [], characterChoices = [], preview = false}: Props) {
  const slots = settings.slots[page] || settings.slots[0]
  const pageName = settings.slotNames[page]?.trim() || `Conjunto ${page + 1}`
  const names = slots.map(action => {
    const target = targetOfAction(action)
    const restoreTarget = restoreTargetOfAction(action)
    const bound = characterBoundOfAction(action)
    if (bound) return `${ACTION_LABELS[bound.command] || bound.command} · ${characterChoices.find(item=>item.id===bound.characterId)?.name || 'Personagem indisponível'}`
    if (restoreTarget) return `Maximizar vida/mana · ${characterChoices.find(item=>item.id===restoreTarget)?.name || 'Personagem indisponível'}`
    if (target) {
      const character = characterChoices.find(item=>item.id===target.characterId)
      const item = (target.kind === 'skill' ? skillChoices : specialChoices).find(item=>item.id===target.id && (!target.characterId || item.characterId===target.characterId))
      return `${item?.name || 'Alvo indisponível'}${character ? ` · ${character.name}` : ''}`
    }
    return action.startsWith('skill.ability')
      ? skillNames[Number(action.slice(-1)) - 1] || ACTION_LABELS[action]
      : ACTION_LABELS[action] || labelForPanelAction(action)
  })
  const buttons = ['Y','X','A','B'] as const
  const indexes = [3,2,0,1]
  return <div className={`otms-skill-wheel ${preview ? 'otms-skill-wheel-preview' : ''}`}
    aria-label={`${pageName}, ${page + 1} de ${settings.slots.length} conjuntos de atalhos LT`} role="group">
    <div className="otms-skill-wheel-halo" aria-hidden="true" />
    <div className="otms-skill-wheel-center"><span>LT</span><strong>{page + 1}</strong><small>de {settings.slots.length}</small><em className="otms-skill-wheel-custom-name" title={pageName}>{pageName}</em></div>
    {buttons.map((button, position) => <div key={button} className={`otms-skill-wheel-slot otms-wheel-slot-${button.toLowerCase()}`}>
      <ControllerGlyph button={button} />
      <span title={names[indexes[position]]}>{names[indexes[position]]}</span>
    </div>)}
    <p className="otms-wheel-instruction">Segure <ControllerGlyph button="LT" small /> + botão • <ControllerGlyph button="RB" small /> troca conjunto</p>
  </div>
}
