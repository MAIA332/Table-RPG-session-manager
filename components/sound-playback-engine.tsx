"use client"

import { useEffect, useRef } from "react"
import type { ActiveSound } from "./soundpad"

type PlayingAudio = {
  element: HTMLAudioElement
  url: string
}

type SoundPlaybackEngineProps = {
  activeSounds: ActiveSound[]
  currentUserId: string
  isGm: boolean
  musicVolume: number
  effectsVolume: number
  onSoundEnded?: (sound: ActiveSound) => void
}

function safeVolume(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function releaseAudio(audio: HTMLAudioElement): void {
  // Não permitir que um evento 'ended' atrasado notifique o servidor após o stop.
  audio.onended = null
  audio.pause()
  audio.removeAttribute("src")
  audio.load()
}

/**
 * O motor fica montado durante toda a permanência na sala, sem depender
 * de a modal Soundpad estar aberta. O ID do disparo é a identidade do áudio:
 * atualizar props e volumes nunca reinicia a faixa em andamento.
 */
export function SoundPlaybackEngine({
  activeSounds,
  currentUserId,
  isGm,
  musicVolume,
  effectsVolume,
  onSoundEnded,
}: SoundPlaybackEngineProps) {
  const playingRef = useRef<Map<string, PlayingAudio>>(new Map())
  const currentSoundsRef = useRef<Map<string, ActiveSound>>(new Map())
  const onEndedRef = useRef(onSoundEnded)
  const completedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    onEndedRef.current = onSoundEnded
  }, [onSoundEnded])

  useEffect(() => {
    const audible = activeSounds.filter((sound) =>
      isGm || sound.targetUserId == null || sound.targetUserId === currentUserId,
    )
    const next = new Map(audible.map((sound) => [sound.id, sound]))
    currentSoundsRef.current = next

    // Remover apenas áudios que realmente pararam ou trocaram de origem.
    for (const [id, existing] of playingRef.current) {
      const sound = next.get(id)
      if (!sound || sound.url !== existing.url) {
        releaseAudio(existing.element)
        playingRef.current.delete(id)
      }
    }

    // Quando um ID sai da lista, ele poderá ser usado novamente no futuro.
    for (const id of completedRef.current) {
      if (!next.has(id)) completedRef.current.delete(id)
    }

    for (const sound of audible) {
      const volume = safeVolume(sound.loop ? musicVolume : effectsVolume)
      const existing = playingRef.current.get(sound.id)
      if (existing) {
        existing.element.volume = volume
        existing.element.loop = sound.loop
        continue
      }

      // Um efeito que já terminou naturalmente não pode reiniciar por causa
      // de uma renderização antes de o servidor confirmar o fim do disparo.
      if (completedRef.current.has(sound.id)) continue

      const audio = new Audio(sound.url)
      audio.loop = sound.loop
      audio.volume = volume
      audio.onended = () => {
        const current = playingRef.current.get(sound.id)
        if (!current || current.element !== audio || audio.loop) return
        completedRef.current.add(sound.id)
        releaseAudio(audio)
        playingRef.current.delete(sound.id)
        const latest = currentSoundsRef.current.get(sound.id)
        if (latest) onEndedRef.current?.(latest)
      }
      playingRef.current.set(sound.id, { element: audio, url: sound.url })
      void audio.play().catch((error: unknown) => {
        console.warn("Áudio não pôde ser tocado automaticamente:", error)
      })
    }
  }, [activeSounds, currentUserId, isGm, musicVolume, effectsVolume])

  // Limpeza somente quando a sala deixa de existir, não ao fechar a modal.
  useEffect(() => {
    return () => {
      for (const { element } of playingRef.current.values()) releaseAudio(element)
      playingRef.current.clear()
      currentSoundsRef.current.clear()
      completedRef.current.clear()
    }
  }, [])

  return null
}
