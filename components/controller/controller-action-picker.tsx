'use client'
import type { InputAction } from '@/lib/input/actions'
import { targetOfAction, targetedAction, restoreTargetOfAction, targetedRestoreAction, type ControllerTarget } from '@/lib/input/targeted-actions'

/** Select duplo: a primeira lista escolhe a operação, a segunda o ID do jogador. */
export function ControllerActionPicker({ value, commands, skills, specials, characters = [], onChange, label, getLabel, includeEmpty = false }: {
  value: InputAction | ''
  commands: readonly InputAction[]
  skills: ControllerTarget[]
  specials: ControllerTarget[]
  characters?: ControllerTarget[]
  onChange: (value: InputAction | '') => void
  label: string
  getLabel: (value: InputAction) => string
  includeEmpty?: boolean
}) {
  const target = targetOfAction(value)
  const restoreTarget = restoreTargetOfAction(value)
  const primaryValue = target ? `${target.kind}.choose` : restoreTarget ? 'character.restore' : value
  const options = target?.kind === 'skill' ? skills : specials
  return <div className="otms-controller-action-picker">
    <select aria-label={label} value={primaryValue} onChange={event => {
      const next = event.target.value
      if (next === 'character.restore') {
        onChange(characters.length > 1 ? targetedRestoreAction(characters[0].id) : 'character.restore')
      } else if (next === 'skill.choose' || next === 'special.choose') {
        const list = next === 'skill.choose' ? skills : specials
        if (list.length) onChange(targetedAction(next === 'skill.choose' ? 'skill' : 'special', list[0].id))
      } else onChange(next as InputAction | '')
    }}>
      {includeEmpty && <option value="">Sem atalho</option>}
      {commands.filter(command => !targetOfAction(command)).map(command => <option key={command} value={command}>{command.startsWith('skill.ability') ? `${getLabel(command)} (posição na ficha)` : getLabel(command)}</option>)}
      {target && <option value={`${target.kind}.choose`}>{target.kind === 'skill' ? 'Habilidade (escolher)' : 'Golpe especial (escolher)'}</option>}
      {!target && <>
        <option value="skill.choose" disabled={!skills.length}>Habilidade (escolher) {skills.length ? '' : '(nenhuma aprendida)'}</option>
        <option value="special.choose" disabled={!specials.length}>Golpe especial (escolher) {specials.length ? '' : '(nenhum cadastrado)'}</option>
      </>}
    </select>
    {(restoreTarget || value === 'character.restore') && characters.length > 1 && <select
      aria-label={`Qual personagem para ${label}`}
      value={restoreTarget && characters.some(item=>item.id===restoreTarget) ? restoreTarget : characters[0]?.id || ''}
      onChange={event=>onChange(targetedRestoreAction(event.target.value))}>
      {characters.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    </select>}
    {target && <select aria-label={target.kind === 'skill' ? `Qual habilidade para ${label}` : `Qual golpe especial para ${label}`}
      value={options.some(item=>item.id===target.id) ? target.id : ''}
      onChange={event=>onChange(targetedAction(target.kind,event.target.value))}>
      {!options.some(item=>item.id===target.id) && <option value="" disabled>Alvo indisponível neste personagem</option>}
      {options.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
    </select>}
  </div>
}
