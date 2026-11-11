'use client'
import { useEffect, useRef } from 'react'
import { registerInputHandler } from './dispatcher'
import type { InputAction } from './actions'

export function useControllerActions(
  handlers: Partial<Record<InputAction, () => boolean | void>>,
  options: { enabled?: boolean; priority?: number; captureAll?: boolean } = {},
) {
  const current = useRef(handlers)
  current.current = handlers
  const enabled = options.enabled !== false
  const priority = options.priority ?? 10
  const captureAll = options.captureAll === true
  useEffect(() => {
    if (!enabled) return
    return registerInputHandler(action => current.current[action]?.() ?? captureAll, priority)
  }, [enabled, priority, captureAll])
}
