/** Efeitos de interface tocados apenas quando o gamepad inicia uma ação. */
export type ControllerSound = 'focus' | 'click'
export const CONTROLLER_SOUND_URLS: Record<ControllerSound, string> = {
  click: '/sounds/clique.mp3',
  focus: '/sounds/focos.MP3',
}

export function createControllerSounds() {
  const players: Partial<Record<ControllerSound, HTMLAudioElement>> = {}
  const lastPlayed: Record<ControllerSound, number> = { focus: -Infinity, click: -Infinity }
  const play = (type: ControllerSound) => {
    if (typeof Audio === 'undefined') return
    const now = performance.now()
    // Limita repetições do analógico e evita acumular dezenas de sons.
    const interval = type === 'focus' ? 65 : 85
    if (now - lastPlayed[type] < interval) return
    lastPlayed[type] = now
    try {
      let audio = players[type]
      if (!audio) {
        audio = new Audio(CONTROLLER_SOUND_URLS[type])
        audio.preload = 'auto'
        audio.volume = type === 'focus' ? 0.21 : 0.28
        players[type] = audio
      }
      audio.pause()
      try { audio.currentTime = 0 } catch { /* stream not yet seekable */ }
      void audio.play().catch(() => { /* blocked autoplay or unreachable URL */ })
    } catch { /* no audio output device */ }
  }
  const dispose = () => {
    for (const audio of Object.values(players)) {
      if (!audio) continue
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
  }
  return { play, dispose }
}
