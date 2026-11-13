import type { InputAction } from './actions'
import { nearestInDirection, type NavDirection } from './spatial-navigation'
import { controllerKeyboardOpen, handleControllerKeyboard, openControllerKeyboard } from './virtual-keyboard'

const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),summary,[role="button"][tabindex]:not([aria-disabled="true"]),[tabindex="0"], [tabindex="-1"][data-controller-item]'
function shown(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const style = getComputedStyle(el)
  return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.pointerEvents !== 'none' &&
    !el.closest('[inert],[aria-hidden="true"]')
}
function activeLayer(): HTMLElement {
  const layers = [...document.querySelectorAll<HTMLElement>('[data-controller-layer="active"],[role="dialog"],[aria-modal="true"]')]
    .filter(shown)
  // Último diálogo é tipicamente o portal aninhado no topo. O menu Start, por design, tem
  // camada própria e prioridade absoluta; demais modais são acessíveis por foco e por B.
  return layers.at(-1) || document.body
}
function eligible(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown)
}
let previouslyFocused: HTMLElement | null = null
let selectDialog: HTMLDivElement | null = null
let selectedIndex = 0
let selectedSource: HTMLSelectElement | null = null

/**
 * Âncora da última seleção física. Quando React substitui/desabilita o botão
 * após A, document.activeElement costuma virar <body>. Preservamos a região
 * e a posição, em vez de reiniciar a navegação pelo primeiro botão da página.
 * Não guarda seletor CSS por texto (IDs e nomes podem repetir em NPCs).
 */
export type ControllerFocusAnchor = {
  element: HTMLElement
  layer: HTMLElement
  parents: HTMLElement[]
  bounds: { left: number; right: number; top: number; bottom: number }
}
let focusAnchor: ControllerFocusAnchor | null = null

export function rememberControllerFocus(element: HTMLElement | null = document.activeElement as HTMLElement | null) {
  if (!element || !shown(element) || element === document.body || element === document.documentElement) return
  const layer = activeLayer()
  if (!layer.contains(element)) return
  const box = element.getBoundingClientRect()
  const parents: HTMLElement[] = []
  for (let parent = element.parentElement; parent && parent !== layer; parent = parent.parentElement) {
    parents.push(parent)
  }
  focusAnchor = {
    element, layer, parents,
    bounds: {left:box.left,right:box.right,top:box.top,bottom:box.bottom},
  }
}

function anchorCandidate(layer: HTMLElement, items: HTMLElement[], anchor = focusAnchor): HTMLElement | null {
  if (!anchor || anchor.layer !== layer || !items.length) return null
  if (items.includes(anchor.element)) return anchor.element
  // Preferir primeiro um ancestral ainda montado: a mesma lista/card, depois
  // a mesma ficha e só então a camada toda. Isso evita saltos entre NPCs.
  const parent = anchor.parents.find(node => node.isConnected && layer.contains(node) &&
    items.some(item => node.contains(item)))
  const options = parent ? items.filter(item => parent.contains(item)) : items
  const from = anchor.bounds
  const centerX = (from.left + from.right) / 2
  const centerY = (from.top + from.bottom) / 2
  const scored = options.map(item => {
    const rect = item.getBoundingClientRect()
    const dx = Math.max(0, rect.left - from.right, from.left - rect.right)
    const dy = Math.max(0, rect.top - from.bottom, from.top - rect.bottom)
    const middleY = (rect.top + rect.bottom) / 2
    const middleX = (rect.left + rect.right) / 2
    // Penalizar troca de coluna, sem saltar dezenas de cards para trás.
    const score = dx * 2 + dy * 2 + Math.abs(middleY - centerY) * .35 + Math.abs(middleX - centerX) * .25
    return {item,score}
  })
  scored.sort((a,b) => a.score - b.score)
  return scored[0]?.item || null
}

/** Restaurar somente se A deixou o foco órfão na MESMA camada. */
export function restoreControllerFocusAfterConfirm(anchor: ControllerFocusAnchor | null) {
  if (!anchor || typeof document === 'undefined') return
  const layer = activeLayer()
  if (layer !== anchor.layer || controllerKeyboardOpen() || controllerSelectOpen()) return
  const current = document.activeElement
  if (current instanceof HTMLElement && current !== document.body && current !== document.documentElement &&
      current.isConnected && shown(current) && !current.matches(':disabled,[aria-disabled="true"]') &&
      layer.contains(current)) return // O fluxo posicionou legitimamente outro elemento.
  const item = anchorCandidate(layer, eligible(layer), anchor)
  if (item) focus(item, false) // Não alterar o scroll executado pelo usuário.
}

/** Captura o foco ANTES da ação; o snapshot não muda durante a renderização. */
export function captureControllerFocusBeforeConfirm(): ControllerFocusAnchor | null {
  const focused = document.activeElement
  if (focused instanceof HTMLElement && focused !== document.body && shown(focused)) rememberControllerFocus(focused)
  return focusAnchor && focusAnchor.layer === activeLayer() ? focusAnchor : null
}

/** Accessible label without descendant option values or nested controls. */
export function controllerFieldLabel(source: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, fallback = 'Campo de texto'): string {
  const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim().slice(0, 72) || ''
  const labelledBy = source.getAttribute('aria-labelledby')?.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(' ')
  const fromLabel = (label: HTMLLabelElement | null) => {
    if (!label) return ''
    const copy = label.cloneNode(true) as HTMLElement
    copy.querySelectorAll('input, select, option, textarea, button, [aria-hidden="true"], small').forEach(el => el.remove())
    return clean(copy.textContent)
  }
  const labels = 'labels' in source && source.labels ? [...source.labels] : []
  return clean(source.getAttribute('aria-label')) || clean(labelledBy) ||
    labels.map(fromLabel).find(Boolean) || fromLabel(source.closest('label')) ||
    clean(source.getAttribute('placeholder')) || clean(source.getAttribute('name')) || fallback
}

export function controllerSelectOpen(): boolean { return !!selectDialog }
export function closeControllerSelect(restore = true) {
  selectDialog?.remove()
  selectDialog = null
  const source = selectedSource
  selectedSource = null
  if (restore && source?.isConnected) source.focus({preventScroll:true})
}
function openControllerSelect(source: HTMLSelectElement) {
  closeControllerSelect(false)
  selectedSource = source
  const dialog = document.createElement('div')
  dialog.className = 'otms-controller-select-overlay'
  dialog.setAttribute('role','dialog')
  dialog.setAttribute('aria-modal','true')
  dialog.setAttribute('aria-label', source.getAttribute('aria-label') || 'Escolher opção')
  const panel = document.createElement('section')
  panel.className = 'otms-controller-select-panel'
  const title = document.createElement('h3')
  // Never read options from a label: select labels can wrap all <option> text
  // and previously rendered titles like MIGD4D6D8D10D12D20.
  title.textContent = controllerFieldLabel(source, 'Escolha uma opção')
  panel.appendChild(title)
  const list = document.createElement('div')
  list.className = 'otms-controller-select-list'
  const available = [...source.options].filter(option => !option.disabled && !option.hidden)
  selectedIndex = Math.max(0,available.findIndex(option=>option.selected))
  available.forEach((option,index)=>{
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = option.textContent || option.value
    button.dataset.optionIndex=String(index)
    button.className = 'otms-controller-select-choice'
    button.setAttribute('aria-selected', String(index===selectedIndex))
    button.onclick=()=>{
      const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')?.set
      setter?.call(source, option.value)
      source.dispatchEvent(new Event('input',{bubbles:true}))
      source.dispatchEvent(new Event('change',{bubbles:true}))
      closeControllerSelect()
    }
    list.appendChild(button)
  })
  const help=document.createElement('p')
  help.textContent='Setas / analógico: escolher  •  A: confirmar  •  B: cancelar'
  help.className='otms-controller-select-help'
  panel.append(list,help)
  dialog.appendChild(panel)
  dialog.addEventListener('pointerdown',event=>{if(event.target===dialog)closeControllerSelect()})
  document.body.appendChild(dialog)
  selectDialog=dialog
  requestAnimationFrame(()=>list.querySelectorAll('button')[selectedIndex]?.focus({preventScroll:true}))
}
function handleSelectDialog(action: InputAction) {
  if (!selectDialog) return false
  if (action === 'ui.back' || action === 'ui.settings') {closeControllerSelect();return true}
  const buttons=[...selectDialog.querySelectorAll<HTMLButtonElement>('button')]
  if (action === 'ui.confirm') {buttons[selectedIndex]?.click();return true}
  if (['ui.down','ui.right','ui.next','ui.up','ui.left','ui.previous'].includes(action)) {
    if(!buttons.length) return true
    const direction = ['ui.down','ui.right','ui.next'].includes(action) ? 1 : -1
    selectedIndex = (selectedIndex + direction + buttons.length) % buttons.length
    buttons.forEach((button,index)=>button.setAttribute('aria-selected',String(index===selectedIndex)))
    buttons[selectedIndex]?.focus({preventScroll:true})
    buttons[selectedIndex]?.scrollIntoView({block:'nearest'})
    return true
  }
  return true
}
/**
 * No arsenal fullscreen, scrollIntoView() pode mover até contêineres com
 * overflow:hidden (e também a página), deslocando cabeçalho e rodapé fixos.
 * Deslocamos exclusivamente o miolo rolável; o restante do site mantém
 * o comportamento atual do foco.
 */
function scrollFocusedIntoView(el: HTMLElement) {
  const root = el.closest<HTMLElement>('[data-controller-scroll-root="special-attacks"], [data-controller-scroll-root="character-creator"], [data-controller-scroll-root="soundpad"], [data-controller-scroll-root="gallery"], [data-controller-scroll-root="bestiary"]')
  if (!root) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    return
  }
  // O cabeçalho e o rodapé são fixos. Não fazer scrollIntoView neles,
  // pois isso também pode deslocar ancestrais com overflow oculto.
  const ports = [...root.querySelectorAll<HTMLElement>('[data-controller-scrollport="true"]')]
    .filter(port => {
      if (!port.contains(el)) return false
      const overflow = getComputedStyle(port).overflowY
      return (overflow === 'auto' || overflow === 'scroll') && port.scrollHeight > port.clientHeight + 1
    })
    .sort((a,b) => a.contains(b) ? 1 : b.contains(a) ? -1 : 0)
  for (const content of ports) {
    const outer = content.getBoundingClientRect()
    const target = el.getBoundingClientRect()
    const verticalMargin = 18
    const horizontalMargin = 12
    const topLimit = outer.top + verticalMargin
    const bottomLimit = outer.bottom - verticalMargin
    const leftLimit = outer.left + horizontalMargin
    const rightLimit = outer.right - horizontalMargin
    let dy = 0
    let dx = 0
    if (target.top < topLimit) dy = target.top - topLimit
    else if (target.bottom > bottomLimit) dy = target.bottom - bottomLimit
    if (target.left < leftLimit) dx = target.left - leftLimit
    else if (target.right > rightLimit) dx = target.right - rightLimit
    if (dy) content.scrollTop += dy
    if (dx && (getComputedStyle(content).overflowX === 'auto' || getComputedStyle(content).overflowX === 'scroll')) content.scrollLeft += dx
  }
}
function focus(el: HTMLElement, reveal = true) {
  previouslyFocused?.removeAttribute('data-controller-focused')
  previouslyFocused = el
  el.dataset.controllerFocused = 'true'
  el.focus({ preventScroll: true })
  rememberControllerFocus(el)
  if (reveal) scrollFocusedIntoView(el)
}
/** Aplica a mesma marcação visível do direcional ao foco definido por atalhos. */
export function focusControllerElement(element: HTMLElement | null | undefined, reveal = true): boolean {
  if (!element || !shown(element)) return false
  focus(element, reveal)
  return true
}
export function clearControllerFocus() {
  closeControllerSelect(false)
  previouslyFocused?.removeAttribute('data-controller-focused')
  previouslyFocused = null
  focusAnchor = null
  document.querySelectorAll('[data-controller-focused]').forEach(el => el.removeAttribute('data-controller-focused'))
}
/** Highest-priority field handling, shared by panels with their own A/arrow mapping. */
export function controllerFocusedFieldAction(action: InputAction): boolean {
  if (typeof document === 'undefined' || controllerKeyboardOpen() || controllerSelectOpen()) return false
  const current = document.activeElement
  if (!(current instanceof HTMLElement) || !shown(current)) return false
  if (action === 'ui.confirm' && (current instanceof HTMLTextAreaElement ||
      (current instanceof HTMLInputElement && ['text','search','email','password','tel','url','number'].includes(current.type)))) {
    if (current.readOnly || current.hasAttribute('disabled')) return true
    openControllerKeyboard(current, controllerFieldLabel(current, current instanceof HTMLInputElement && current.type === 'number' ? 'Valor numérico' : 'Digite o texto'))
    return true
  }
  if (action !== 'ui.left' && action !== 'ui.right') return false
  if (!(current instanceof HTMLInputElement) || current.readOnly || current.disabled) return false
  if (current.type === 'range') {
    current.stepUp(action === 'ui.right' ? 1 : -1)
    current.dispatchEvent(new Event('input',{bubbles:true}))
    current.dispatchEvent(new Event('change',{bubbles:true}))
    return true
  }
  if (current.type !== 'number') return false
  const step = current.step && current.step !== 'any' && Number(current.step) > 0 ? Number(current.step) : 1
  const min = current.min !== '' ? Number(current.min) : -Infinity
  const max = current.max !== '' ? Number(current.max) : Infinity
  const value = current.value === '' ? (Number.isFinite(min) ? min : 0) : Number(current.value)
  const next = Math.min(max, Math.max(min, value + (action === 'ui.right' ? step : -step)))
  if (Number.isFinite(next) && (next !== value || current.value === '')) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(current, String(Number(next.toFixed(10))))
    current.dispatchEvent(new Event('input', {bubbles:true}))
    current.dispatchEvent(new Event('change', {bubbles:true}))
  }
  return true
}

export function controllerFocus(action: InputAction, requestedLayer?: HTMLElement | null): boolean {
  if (controllerKeyboardOpen()) return handleControllerKeyboard(action)
  if (selectDialog) return handleSelectDialog(action)
  // Modais em portais podem coexistir com fichas da sala. O dono da interação
  // informa seu escopo para não navegar por elementos atrás do modal.
  const layer = requestedLayer && shown(requestedLayer) ? requestedLayer : activeLayer()
  const items = eligible(layer)
  const current = document.activeElement as HTMLElement | null
  const entry = () => location.pathname === '/'
    ? items.find(el => el.matches('input[type="email"]')) || items[0]
    : items.find(el => el.hasAttribute('data-controller-combat-start')) ||
      items.find(el => el.hasAttribute('data-controller-initial')) || items[0]
  if (action === 'ui.confirm') {
    if (current && layer.contains(current) && shown(current)) {
      if (controllerFocusedFieldAction(action)) return true
      if (current instanceof HTMLSelectElement) {openControllerSelect(current);return true}
      current.click(); return true
    }
    const recovery = anchorCandidate(layer, items)
    const first = recovery || entry()
    if (first) { focus(first, !recovery); return true }
    return false
  }
  if (action === 'ui.back') {
    if (layer !== document.body) {
      const close = items.find(item => /fechar|cancelar|sair|close/i.test(
        `${item.getAttribute('aria-label') || ''} ${item.getAttribute('title') || ''}`)) ||
        items.find(item => /^(fechar|cancelar|voltar|sair|retornar)$/i.test((item.textContent || '').trim()))
      if (close) { close.click(); return true }
      layer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))
      return true
    }
    return false
  }
  if (!items.length) return false
  if (controllerFocusedFieldAction(action)) return true
  const direction = ({'ui.up':'up', 'ui.down':'down', 'ui.left':'left', 'ui.right':'right',
    'ui.previous':'left', 'ui.next':'right' } as Partial<Record<InputAction, NavDirection>>)[action]
  if (!direction) return false
  let navigationOrigin = current && items.includes(current) ? current : anchorCandidate(layer, items)
  if (!navigationOrigin) {
    const first = entry()
    if (first) focus(first)
    return true
  }
  // Se o botão anterior desapareceu, partir do substituto na MESMA área.
  // Ao mover numa direção, continuar a partir dele em vez de voltar ao topo.
  if (navigationOrigin !== current) focus(navigationOrigin, false)
  const from = navigationOrigin.getBoundingClientRect()
  const candidates = items.filter(item => item !== navigationOrigin)
  const index = nearestInDirection(from, candidates.map(item => item.getBoundingClientRect()), direction)
  if (index >= 0) focus(candidates[index])
  return true
}
