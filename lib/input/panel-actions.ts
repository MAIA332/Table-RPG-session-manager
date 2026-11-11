'use client'
import type { InputAction } from './actions'
export type PanelAction = `panel.${string}`
export interface PanelCommand { action: PanelAction; label: string; element: HTMLButtonElement }
/** IDs de atalhos derivados do texto visível; não executam código nem ignoram permissões. */
export function listPanelCommands(): PanelCommand[] {
  if (typeof document === 'undefined') return []
  const counters = new Map<string,number>()
  return [...document.querySelectorAll<HTMLButtonElement>('[data-controller-bindable-panel] button')].flatMap(element=>{
    const label = (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim().replace(/\s+/g,' ').slice(0,95)
    if (!label || !element.isConnected || element.closest('[aria-hidden="true"],[inert]')) return []
    const slug = label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,75)
    if (!slug) return []
    const instance = counters.get(slug)||0
    counters.set(slug,instance+1)
    return [{action:`panel.${slug}.${instance}` as PanelAction,label,element}]
  })
}
export function triggerPanelAction(action: InputAction) {
  if (!action.startsWith('panel.')) return false
  const entry=listPanelCommands().find(command=>command.action===action)
  if (!entry || entry.element.disabled || entry.element.getAttribute('aria-disabled') === 'true') return true
  entry.element.click()
  return true
}
export function labelForPanelAction(action: InputAction) {
  const live=listPanelCommands().find(command=>command.action===action)
  return live?.label || action.replace(/^panel\./,'').replace(/\.\d+$/,'').replace(/-/g,' ')
}
