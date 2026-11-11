import type { InputAction } from './actions'
import { nearestInDirection, type NavDirection } from './spatial-navigation'

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
  title.textContent = source.getAttribute('aria-label') || source.closest('label')?.textContent?.trim().slice(0,90) || 'Escolha uma opção'
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
  const root = el.closest<HTMLElement>('[data-controller-scroll-root="special-attacks"], [data-controller-scroll-root="character-creator"], [data-controller-scroll-root="soundpad"]')
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
function focus(el: HTMLElement) {
  previouslyFocused?.removeAttribute('data-controller-focused')
  previouslyFocused = el
  el.dataset.controllerFocused = 'true'
  el.focus({ preventScroll: true })
  scrollFocusedIntoView(el)
}
/** Aplica a mesma marcação visível do direcional ao foco definido por atalhos. */
export function focusControllerElement(element: HTMLElement | null | undefined): boolean {
  if (!element || !shown(element)) return false
  focus(element)
  return true
}
export function clearControllerFocus() {
  closeControllerSelect(false)
  previouslyFocused?.removeAttribute('data-controller-focused')
  previouslyFocused = null
  document.querySelectorAll('[data-controller-focused]').forEach(el => el.removeAttribute('data-controller-focused'))
}
export function controllerFocus(action: InputAction, requestedLayer?: HTMLElement | null): boolean {
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
      if (current.matches('input:not([type="checkbox"]):not([type="radio"]), textarea')) {
        current.focus(); return true
      }
      if (current instanceof HTMLSelectElement) {openControllerSelect(current);return true}
      current.click(); return true
    }
    const first = entry()
    if (first) { focus(first); return true }
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
  // Ajustes de slider continuam no eixo horizontal; selects NÃO são alterados por setas.
  if (current && layer.contains(current) && (action === 'ui.left' || action === 'ui.right')) {
    if (current instanceof HTMLInputElement && current.type === 'range') {
      current.stepUp(action === 'ui.right' ? 1 : -1)
      current.dispatchEvent(new Event('input',{bubbles:true}))
      current.dispatchEvent(new Event('change',{bubbles:true}))
      return true
    }
  }
  const direction = ({'ui.up':'up', 'ui.down':'down', 'ui.left':'left', 'ui.right':'right',
    'ui.previous':'left', 'ui.next':'right' } as Partial<Record<InputAction, NavDirection>>)[action]
  if (!direction) return false
  if (!current || !items.includes(current)) {
    const first = entry()
    if (first) focus(first)
    return true
  }
  const from = current.getBoundingClientRect()
  const candidates = items.filter(item => item !== current)
  const index = nearestInDirection(from, candidates.map(item => item.getBoundingClientRect()), direction)
  if (index >= 0) focus(candidates[index])
  return true
}
