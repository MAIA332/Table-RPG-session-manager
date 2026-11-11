'use client'
import type { InputAction } from '@/lib/input/actions'
import {
  targetOfAction, targetedAction, restoreTargetOfAction, targetedRestoreAction,
  characterBoundAction, characterBoundOfAction, type CharacterBoundCommand, type ControllerTarget,
} from '@/lib/input/targeted-actions'

const CHARACTER_COMMANDS = new Set<string>([
  'character.sheet', 'special.manager', 'skill.ability1', 'skill.ability2',
  'skill.ability3', 'skill.ability4',
])
function isCharacterCommand(value: string): value is CharacterBoundCommand {
  return CHARACTER_COMMANDS.has(value)
}

/** Mantém o primeiro seletor sempre semântico e vincula personagem/ação por ID. */
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
  const bound = characterBoundOfAction(value)
  const restoreTarget = restoreTargetOfAction(value)
  const primaryValue = target ? `${target.kind}.choose` : bound?.command || (restoreTarget ? 'character.restore' : value)
  const needsCharacter = characters.length > 1 && (Boolean(target) || isCharacterCommand(primaryValue) || primaryValue === 'character.restore')
  const targetList = target?.kind === 'skill' || primaryValue === 'skill.choose' ? skills : specials
  const inferredCharacterId = target && !target.characterId ? targetList.find(item => item.id === target.id)?.characterId : undefined
  const selectedCharacterId = target?.characterId || bound?.characterId || restoreTarget || inferredCharacterId || characters[0]?.id || ''
  const filteredTargets = targetList.filter(item => !needsCharacter || !item.characterId || item.characterId === selectedCharacterId)
  const makeCommand = (command: string, characterId: string): InputAction => {
    if (command === 'character.restore') return targetedRestoreAction(characterId)
    if (isCharacterCommand(command)) return characterBoundAction(command, characterId)
    const kind = command === 'skill.choose' ? 'skill' : 'special'
    const choices = (kind === 'skill' ? skills : specials).filter(item => !item.characterId || item.characterId === characterId)
    if (choices.length) return targetedAction(kind, choices[0].id, characters.length > 1 ? characterId : undefined)
    return '' as InputAction
  }
  return <div className="otms-controller-action-picker">
    <select aria-label={label} value={primaryValue} onChange={event => {
      const next = event.target.value
      if (next === 'character.restore' || isCharacterCommand(next) && characters.length > 1) {
        onChange(characters.length > 1 ? makeCommand(next, characters[0].id) : next as InputAction)
      } else if (next === 'skill.choose' || next === 'special.choose') {
        const candidates = next === 'skill.choose' ? skills : specials
        const initial = candidates[0]
        if (initial) onChange(targetedAction(next === 'skill.choose' ? 'skill' : 'special', initial.id, characters.length > 1 ? (initial.characterId || characters[0]?.id) : undefined))
      } else onChange(next as InputAction | '')
    }}>
      {includeEmpty && <option value="">Sem atalho</option>}
      {commands.filter(command => !targetOfAction(command) && !characterBoundOfAction(command)).map(command =>
        <option key={command} value={command}>{command.startsWith('skill.ability') ? `${getLabel(command)} (posição na ficha)` : getLabel(command)}</option>)}
      {target && <option value={`${target.kind}.choose`}>{target.kind === 'skill' ? 'Habilidade (escolher)' : 'Golpe especial (escolher)'}</option>}
      {!target && <>
        <option value="skill.choose" disabled={!skills.length}>Habilidade (escolher) {skills.length ? '' : '(nenhuma aprendida)'}</option>
        <option value="special.choose" disabled={!specials.length}>Golpe especial (escolher) {specials.length ? '' : '(nenhum cadastrado)'}</option>
      </>}
    </select>
    {needsCharacter && <select
      aria-label={`Qual personagem para ${label}`}
      value={characters.some(item => item.id === selectedCharacterId) ? selectedCharacterId : characters[0]?.id || ''}
      onChange={event => onChange(makeCommand(primaryValue, event.target.value))}>
      {characters.map(item => <option key={item.id} value={item.id}
        disabled={(primaryValue === 'skill.choose' && !skills.some(skill => !skill.characterId || skill.characterId === item.id)) ||
          (primaryValue === 'special.choose' && !specials.some(special => !special.characterId || special.characterId === item.id))}>
        {item.name}
      </option>)}
    </select>}
    {target && <select aria-label={target.kind === 'skill' ? `Qual habilidade para ${label}` : `Qual golpe especial para ${label}`}
      value={filteredTargets.some(item => item.id === target.id) ? target.id : ''}
      onChange={event => onChange(targetedAction(target.kind, event.target.value, characters.length > 1 ? selectedCharacterId : undefined))}>
      {!filteredTargets.some(item => item.id === target.id) && <option value="" disabled>Alvo indisponível neste personagem</option>}
      {filteredTargets.map(item => <option key={`${item.characterId || ''}:${item.id}`} value={item.id}>{item.name}</option>)}
    </select>}
  </div>
}
