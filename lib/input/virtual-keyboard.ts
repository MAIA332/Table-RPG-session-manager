import type { GamepadButtonName, InputAction } from './actions'
import { nearestInDirection, type NavDirection } from './spatial-navigation'

type Editable = HTMLInputElement | HTMLTextAreaElement
let overlay: HTMLDivElement | null = null
let source: Editable | null = null
let selected = 0
let keys: HTMLButtonElement[] = []
let draft = ''
let cursor = 0
let upper = false
let symbols = false
let numeric = false
let title = ''
let preview: HTMLElement | null = null
let index = 0
let previouslyFocused: HTMLElement | null = null

/** Atalhos físicos temporários. Não alteram o mapeamento persistente do jogo. */
export const VIRTUAL_KEYBOARD_SHORTCUTS = {
  X: 'Apagar', Y: 'Limpar tudo', LB: 'Cursor à esquerda', RT: 'Cursor à direita',
  RB: 'Maiúsculas', VIEW: 'ABC / símbolos', MENU: 'Concluir',
  LT: 'Espaço', LS: 'Início do texto', RS: 'Fim do texto',
} as const satisfies Partial<Record<GamepadButtonName, string>>


export function controllerKeyboardOpen(): boolean { return !!overlay }

function updatePreview() {
  if (!preview) return
  const visible = source?.type === 'password' ? '•'.repeat(draft.length) : draft
  // Cursor de inserção legível: RT/LB movem a posição de edição, não o foco
  // dos botões. A caixa mantém o cursor à vista, inclusive com URLs extensas.
  const caret = document.createElement('span')
  caret.className = 'otms-controller-keyboard-caret'
  caret.setAttribute('aria-hidden', 'true')
  caret.textContent = '\u200b'
  const begin = Math.max(0, cursor - 180)
  const end = Math.min(visible.length, cursor + 180)
  preview.replaceChildren(document.createTextNode((begin ? '…' : '') + visible.slice(begin, cursor)), caret,
    document.createTextNode(visible.slice(cursor, end) + (end < visible.length ? '…' : '') || (draft ? '' : ' ')))
  preview.setAttribute('aria-label', `Texto, cursor na posição ${cursor + 1} de ${draft.length + 1}`)
  const viewport = preview.getBoundingClientRect()
  const position = caret.getBoundingClientRect()
  if (position.bottom > viewport.bottom - 10) preview.scrollTop += position.bottom - viewport.bottom + 14
  else if (position.top < viewport.top + 10) preview.scrollTop -= viewport.top - position.top + 14
  if (position.right > viewport.right - 12) preview.scrollLeft += position.right - viewport.right + 18
  else if (position.left < viewport.left + 12) preview.scrollLeft -= viewport.left - position.left + 18
}
function setDraftValue(value: string, caret = value.length) {
  const limit = source && source.maxLength >= 0 ? source.maxLength : Math.max(1_000_000, draft.length + 1024)
  draft = value.slice(0, limit)
  cursor = Math.max(0, Math.min(caret, draft.length))
  updatePreview()
}
function insert(value: string) {
  if (numeric && !/^[\d.,\-]+$/.test(value)) return
  let addition = value
  if (numeric) {
    addition = addition.replace(',', '.')
    if (addition === '-' && (cursor !== 0 || draft.includes('-'))) return
    if (addition === '.' && draft.includes('.')) return
  }
  setDraftValue(draft.slice(0, cursor) + addition + draft.slice(cursor), cursor + addition.length)
}
function backspace() {
  if (cursor < 1) return
  setDraftValue(draft.slice(0, cursor-1) + draft.slice(cursor), cursor-1)
}
function moveCursor(delta: number) {
  setDraftValue(draft, delta === -Infinity ? 0 : delta === Infinity ? draft.length : cursor + delta)
}
function toggleUpper() {if (!numeric) {upper = !upper; renderKeys()}}
function toggleSymbols() {if (!numeric) {symbols = !symbols; renderKeys()}}

/** Ações de um botão FÍSICO enquanto o teclado está aberto (Start = MENU). */
export function handleControllerKeyboardButton(button: GamepadButtonName): boolean {
  if (!overlay) return false
  switch (button) {
    case 'X': backspace(); break
    case 'Y': setDraftValue(''); break
    case 'LB': moveCursor(-1); break
    case 'RT': moveCursor(1); break
    case 'LS': moveCursor(-Infinity); break
    case 'RS': moveCursor(Infinity); break
    case 'RB': toggleUpper(); break
    case 'VIEW': toggleSymbols(); break
    case 'LT': insert(' '); break
    case 'MENU': commit(); break
    default: return false
  }
  return true
}
function commit() {
  if (!source || !source.isConnected) {closeControllerKeyboard(false);return}
  if (numeric && draft && !/^-?(?:\d+\.?\d*|\.\d+)$/.test(draft)) return
  const oldSource = source
  const value = numeric ? draft.replace(',', '.') : draft
  const proto = oldSource instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(oldSource, value)
  oldSource.dispatchEvent(new Event('input', {bubbles:true}))
  oldSource.dispatchEvent(new Event('change', {bubbles:true}))
  closeControllerKeyboard()
  // Alguns campos (ex.: Zenits e capacidade da mochila) só persistem em onBlur.
  // Aguarda o React processar o input/change antes de disparar o blur final;
  // nunca desfoca outro elemento se o usuário já mudou de contexto.
  requestAnimationFrame(() => {
    if (oldSource.isConnected && document.activeElement === oldSource) oldSource.blur()
  })
}

const letters = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l','ç'],
  ['z','x','c','v','b','n','m','á','é','í'],
  ['ó','ú','ã','õ','â','ê','ô','à','ü','-'],
]
const symbolRows = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['@','#','$','%','&','*','(',')','/','?'],
  ['!','+','-','_','=',':',';',',','.','\\'],
  ['[',']','{','}','"',"'",'<','>','~','^'],
]
const numericRows = [
  ['7','8','9'], ['4','5','6'], ['1','2','3'], ['-','0','.'],
]

function renderKeys() {
  const grid = overlay?.querySelector<HTMLElement>('.otms-controller-keyboard-keys')
  if (!grid) return
  grid.replaceChildren()
  keys = []
  const rows = numeric ? numericRows : symbols ? symbolRows : letters
  const add = (label: string, value: string, special = false) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'otms-controller-keyboard-key' + (special ? ' otms-controller-keyboard-special' : '')
    button.textContent = label
    button.dataset.keyboardValue = value
    // Não remover o foco do input de origem: alguns formulários React
    // desmontam o campo no onBlur, fechando o teclado no primeiro direcional.
    button.addEventListener('pointerdown', event => event.preventDefault())
    button.addEventListener('mousedown', event => event.preventDefault())
    button.addEventListener('click', () => {
      if (value === 'commit') {commit();return}
      if (value === 'cancel') {closeControllerKeyboard();return}
      if (value === 'back') backspace()
      else if (value === 'shift') {toggleUpper();return}
      else if (value === 'symbols') {toggleSymbols();return}
      else if (value === 'clear') setDraftValue('')
      else if (value === 'space') insert(' ')
      else if (value === 'newline') insert('\n')
      else insert(upper ? value.toLocaleUpperCase('pt-BR') : value)
      updatePreview()
      if (overlay) highlight(button)
    })
    grid.appendChild(button)
    keys.push(button)
    return button
  }
  rows.forEach(row => row.forEach(letter => add(upper ? letter.toLocaleUpperCase('pt-BR') : letter, letter)))
  if (!numeric) {
    add(upper ? 'RB · Minúsculas' : 'RB · Maiúsculas', 'shift', true)
    add(symbols ? 'VIEW · ABC' : 'VIEW · 123 +', 'symbols', true)
    add('LT · Espaço', 'space', true)
    if (source instanceof HTMLTextAreaElement) add('↵ Linha', 'newline', true)
  }
  add('X · Apagar', 'back', true)
  add('Y · Limpar', 'clear', true)
  add('B  Cancelar', 'cancel', true)
  add('Start · Concluir', 'commit', true)
  selected = Math.max(0, Math.min(index, keys.length - 1))
  highlight(keys[selected] || keys[0])
}
function highlight(button: HTMLButtonElement | undefined) {
  if (!button) return
  selected = keys.indexOf(button)
  index = selected
  keys.forEach(key => {key.removeAttribute('data-controller-focused');key.setAttribute('aria-selected', String(key === button))})
  button.dataset.controllerFocused = 'true'
  // Seleção virtual ≠ foco DOM: preserva o input original durante a digitação.
  // Isso evita o onBlur automático de inputs numéricos condicionais.
  button.scrollIntoView({block:'nearest',inline:'nearest'})
}

/** Controller-only text entry. Desktop typing continues to use native controls. */
export function openControllerKeyboard(element: Editable, label: string) {
  if (typeof document === 'undefined' || element.disabled || element.readOnly) return
  closeControllerKeyboard(false)
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : element
  source = element
  numeric = element instanceof HTMLInputElement && element.type === 'number'
  upper = false; symbols = false
  title = label
  draft = element.value
  cursor = numeric ? draft.length : (element.selectionStart ?? draft.length)
  const dialog = document.createElement('div')
  dialog.className = 'otms-controller-keyboard-overlay'
  dialog.setAttribute('role','dialog')
  dialog.setAttribute('aria-modal','true')
  dialog.setAttribute('aria-label',`Teclado virtual: ${title}`)
  const panel = document.createElement('div')
  panel.className='otms-controller-keyboard-panel'
  const header = document.createElement('header')
  const heading = document.createElement('h3')
  heading.textContent = title
  const hint = document.createElement('p')
  hint.textContent = 'Selecione letras com o direcional ou analógico esquerdo e pressione A.'
  header.append(heading,hint)
  preview = document.createElement('div')
  preview.className='otms-controller-keyboard-preview'
  preview.setAttribute('role', 'textbox')
  preview.setAttribute('aria-readonly', 'true')
  preview.setAttribute('aria-live','polite')
  const grid = document.createElement('div')
  grid.className='otms-controller-keyboard-keys'
  if (numeric) grid.classList.add('otms-controller-keyboard-numeric')
  const footer = document.createElement('p')
  footer.className='otms-controller-keyboard-help'
  footer.textContent='A selecionar · B cancelar · Start concluir · X apagar · Y limpar · LB / RT mover cursor · RB maiúsculas · VIEW símbolos · LT espaço · L3 / R3 início/fim'
  panel.append(header,preview,grid,footer)
  dialog.appendChild(panel)
  dialog.addEventListener('pointerdown', e => {if (e.target===dialog) closeControllerKeyboard()})
  dialog.addEventListener('keydown', e => {
    if (e.key === 'Escape') {e.preventDefault();e.stopPropagation();closeControllerKeyboard()}
  })
  overlay=dialog
  document.body.appendChild(dialog)
  updatePreview()
  index=0
  renderKeys()
}
export function closeControllerKeyboard(restore = true) {
  overlay?.remove()
  overlay = null
  preview = null
  keys = []
  const current = source
  source = null
  const target = current?.isConnected ? current : previouslyFocused
  previouslyFocused = null
  if (restore && target?.isConnected) target.focus({preventScroll:true})
}
export function handleControllerKeyboard(action: InputAction): boolean {
  if (!overlay) return false
  if (!source?.isConnected) {closeControllerKeyboard(false);return true}
  if (action==='ui.back' || action==='ui.settings') {closeControllerKeyboard();return true}
  if (action==='ui.confirm') {keys[selected]?.click();return true}
  const directions: Partial<Record<InputAction,NavDirection>> = {
    'ui.up':'up','ui.down':'down','ui.left':'left','ui.right':'right',
    'ui.previous':'left','ui.next':'right',
  }
  const direction = directions[action]
  if (!direction) return true
  const current = keys[selected]
  if (!current) return true
  const origin = current.getBoundingClientRect()
  const candidates = keys.filter(k=>k!==current)
  const best = nearestInDirection(origin, candidates.map(k=>k.getBoundingClientRect()), direction)
  if (best>=0) highlight(candidates[best])
  return true
}
