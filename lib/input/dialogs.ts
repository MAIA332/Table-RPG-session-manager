/** Controller-safe replacements for blocking browser dialogs.
 * In desktop mode the original browser behavior is retained.
 */
export type ControllerDialogRequest = {
  id: number
  kind: 'confirm' | 'alert'
  message: string
  resolve: (accepted: boolean) => void
}
let nextId = 0

function request(kind: ControllerDialogRequest['kind'], message: string, controllerMode = false): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  const recentlyUsedGamepad = Date.now() - Number(document.documentElement.dataset.otmsControllerActionAt || 0) < 1200
  if (!controllerMode && !recentlyUsedGamepad && document.documentElement.dataset.input !== 'controller') {
    return Promise.resolve(kind === 'confirm' ? window.confirm(message) : (window.alert(message), true))
  }
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent<ControllerDialogRequest>('otms.controller.dialog', {
      detail: {id: ++nextId, kind, message, resolve},
    }))
  })
}
export const controllerConfirm = (message: string, controllerMode = false): Promise<boolean> => request('confirm', message, controllerMode)
export const controllerAlert = (message: string): void => { void request('alert', message) }
