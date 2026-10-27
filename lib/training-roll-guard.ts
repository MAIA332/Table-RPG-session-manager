import type { Character } from "./types"
import { isTrainingActive } from "./training-model"

/**
 * Guard para a rota de transmissão de rolagens `/api/campaigns/[id]/roll`.
 * Esta rota não foi enviada; chame esta função depois de resolver o personagem
 * autenticado no banco e ANTES de publicar o evento de dados.
 * Não trate gestos administrativos, como PLAYER_HAND_RAISED, como rolagens.
 */
export function assertCharacterCanRoll(character: Character, attribute?: unknown, now = Date.now()): void {
  if (attribute === "PLAYER_HAND_RAISED") return
  if (isTrainingActive((character as Character & { training?: unknown }).training, now))
    throw new Error("O personagem está treinando e não pode rolar dados.")
}
