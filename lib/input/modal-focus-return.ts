'use client'

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import { useController } from '@/components/controller/controller-provider'
import { useControllerActions } from './use-controller-actions'
import { controllerFocus, focusControllerElement } from './focus'
import { captureControllerOpener, restoreControllerOpener } from './focus-origin'

type Opener = HTMLElement | null

/** Retorno ao controle que abriu a modal. Não interfere no uso por mouse. */
export function useControllerModalReturn(open: boolean) {
  const { active } = useController()
  const activeRef = useRef(active)
  activeRef.current = active
  useLayoutEffect(() => {
    if (!open) return
    const origin = captureControllerOpener()
    return () => { if (activeRef.current) restoreControllerOpener(origin) }
  }, [open])
}

/** Para portais em que diversas modalidades de diálogo dependem da mesma sala. */
export function useControllerModalReturnGroup(layers: Record<string, boolean>) {
  const { active } = useController()
  const activeRef = useRef(active)
  activeRef.current = active
  const previous = useRef<Record<string, boolean>>({})
  const origins = useRef<Record<string, Opener>>({})
  useLayoutEffect(() => {
    for (const [name, open] of Object.entries(layers)) {
      if (open && !previous.current[name]) origins.current[name] = captureControllerOpener()
      if (!open && previous.current[name]) {
        if (activeRef.current) restoreControllerOpener(origins.current[name])
        delete origins.current[name]
      }
    }
    previous.current = { ...layers }
  })
  // Ex.: uma mochila aberta por atalho desmonta sua ficha hospedeira ao fechar.
  // Também recupera o foco quando a camada inteira desaparece nesse commit.
  useEffect(() => () => {
    if (!activeRef.current) return
    for (const [name, open] of Object.entries(previous.current)) {
      if (open) restoreControllerOpener(origins.current[name])
    }
  }, [])
}

/** Isola as setas/A/B no modal, evitando navegar na campanha atrás dele. */
export function useControllerModalNavigation(
  open: boolean,
  root: RefObject<HTMLElement | null>,
  close: () => void,
  priority = 275,
) {
  const { active } = useController()
  const closeRef = useRef(close)
  closeRef.current = close
  useControllerModalReturn(open)
  useControllerActions({
    'ui.up': () => controllerFocus('ui.up', root.current),
    'ui.down': () => controllerFocus('ui.down', root.current),
    'ui.left': () => controllerFocus('ui.left', root.current),
    'ui.right': () => controllerFocus('ui.right', root.current),
    'ui.next': () => controllerFocus('ui.right', root.current),
    'ui.previous': () => controllerFocus('ui.left', root.current),
    'ui.confirm': () => controllerFocus('ui.confirm', root.current),
    'ui.back': () => { closeRef.current(); return true },
  }, { enabled: active && open, priority, captureAll: true })
  useEffect(() => {
    if (!open || !active) return
    const frame = requestAnimationFrame(() => {
      // Um item inicial oculto num layout responsivo não pode impedir o foco
      // de alcançar os itens visíveis, especialmente ao trocar de painel na TV.
      const preferred = root.current?.querySelectorAll<HTMLElement>('[data-controller-initial]') || []
      const fallback = root.current?.querySelectorAll<HTMLElement>('button:not([disabled]),[role="button"][tabindex],input:not([disabled])') || []
      for (const element of [...preferred, ...fallback]) {
        if (focusControllerElement(element)) break
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [open, active, root])
}
