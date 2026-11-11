/** Separa ambiência/música de efeitos pontuais para atenuar apenas a trilha local. */
export function isMusicForDucking(
  sound: { loop: boolean; playlist?: unknown; url: string; trackId: string },
  track?: { name?: string; loopable?: boolean; isCustom?: boolean; audioRole?: "music" | "ambience" | "sfx" },
  duration?: number,
): boolean {
  // A classificação escolhida no Soundpad prevalece sobre loop, playlist,
  // duração, nome e provedor. Zipline pode hospedar qualquer tipo de áudio.
  if (track?.audioRole === "sfx") return false
  if (track?.audioRole === "music" || track?.audioRole === "ambience") return true
  if (sound.playlist || sound.loop || track?.loopable) return true
  if (/^(?:snd_sword|snd_magic|snd_monster|snd_blaster)$/.test(sound.trackId)) return false
  if (/\b(?:efeito|sfx|impacto|clique|click|grito|golpe|explos[aã]o|passos|tiro)\b/i.test(track?.name || "")) return false
  if (/\b(?:musica|música|trilha|ambienta[cç][aã]o|soundtrack|ost|bgm|tema|theme|music|ambience)\b/i.test(track?.name || "")) return true
  // Usar provedor apenas como fallback para cadastros antigos.
  if (/youtube\.com|youtu\.be|spotify\.com/i.test(sound.url)) return true
  // A maioria das faixas personalizadas é música, mas efeitos curtos não
  // devem cair de volume. Quando a duração é conhecida, ela prevalece.
  if (duration !== undefined && Number.isFinite(duration)) return duration >= 14
  return Boolean(track?.isCustom)
}
