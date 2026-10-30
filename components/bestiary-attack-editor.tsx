"use client"

import {
  ATTRIBUTES,
  DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS,
  MAX_SPECIAL_ATTACK_PREVIEW_SECONDS,
  Attack,
  Attribute,
} from "@/lib/combat-model"

const input =
  "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none transition focus:border-destructive/40 focus:ring-2 focus:ring-destructive/20"

type CreatureDice = Record<Attribute, string>

function attributeLabel(attribute: Attribute, creatureDice: CreatureDice) {
  return `${attribute.toUpperCase()} (${creatureDice[attribute] || "d6"})`
}

function formulaLabel(attributes: Attribute[], creatureDice: CreatureDice) {
  return attributes.map((attribute) => attributeLabel(attribute, creatureDice)).join(" + ")
}

async function fileToCompactImage(file: File): Promise<string> {
  if (file.size > 12_000_000) {
    throw new Error("Arquivo muito grande (máximo 12 MB antes da compactação).")
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / bitmap.width, 900 / bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Seu navegador não suporta compactação de imagens.")
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  let encoded = canvas.toDataURL("image/webp", 0.76)
  if (encoded.length > 650_000) encoded = canvas.toDataURL("image/webp", 0.45)
  if (encoded.length > 650_000) {
    throw new Error("Imagem ainda muito grande. Use uma URL HTTPS para preservar a qualidade.")
  }
  return encoded
}

export function BestiaryAttackEditor({
  value,
  creatureDice,
  onChange,
}: {
  value: Attack
  creatureDice: CreatureDice
  onChange: (value: Attack) => void
}) {
  const attributes: Attribute[] = Array.isArray(value.attributes) && value.attributes.length > 0
    ? value.attributes
    : ["mig"]

  const setAttributes = (nextAttributes: Attribute[]) => {
    onChange({ ...value, attributes: nextAttributes })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-zinc-300">
          <span>Nome do ataque</span>
          <input
            className={input}
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-zinc-300">
          <span>Alvo do ataque</span>
          <select
            className={input}
            value={value.targetDefense}
            onChange={(event) =>
              onChange({
                ...value,
                targetDefense: event.target.value as Attack["targetDefense"],
              })
            }
          >
            <option value="physical">Defesa Física</option>
            <option value="magical">Defesa Mágica</option>
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-destructive/35 bg-destructive/5 p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-[0.35em] text-destructive/90">
          Fórmula de acerto
        </div>
        <p className="mb-4 text-sm text-zinc-400">
          Escolha de 1 a 10 atributos, repetidos ou diferentes. Cada posição equivale a um dado independente.
        </p>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {attributes.map((attribute, index) => (
            <div key={`${index}:${attribute}`} className="grid grid-cols-[26px_minmax(0,1fr)_44px] items-center gap-3">
              <span className="text-sm text-zinc-500">{index + 1}</span>
              <select
                className={input}
                value={attribute}
                onChange={(event) => {
                  const next = [...attributes]
                  next[index] = event.target.value as Attribute
                  setAttributes(next)
                }}
              >
                {ATTRIBUTES.map((entry) => (
                  <option key={entry} value={entry}>
                    {attributeLabel(entry, creatureDice)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={attributes.length <= 1}
                onClick={() => setAttributes(attributes.filter((_, currentIndex) => currentIndex !== index))}
                className="rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-lg text-zinc-300 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Remover atributo ${index + 1}`}
              >
                −
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-mono text-xl font-black text-amber-200">
              {formulaLabel(attributes, creatureDice)}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              {attributes.length}/10 dados na rolagem
            </div>
          </div>
          <button
            type="button"
            disabled={attributes.length >= 10}
            onClick={() => setAttributes([...attributes, "mig"])}
            className="rounded-xl border border-destructive/45 bg-destructive/5 px-4 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            + Adicionar atributo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-zinc-300">
          <span>Dano fixo ou dados</span>
          <input
            className={input}
            value={value.damage}
            onChange={(event) => onChange({ ...value, damage: event.target.value })}
            placeholder="10 ou 2d6+2"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-zinc-300">
          <span>Tipo de dano</span>
          <select
            className={input}
            value={value.type}
            onChange={(event) => onChange({ ...value, type: event.target.value })}
          >
            {["físico", "fogo", "gelo", "raio", "ar", "terra", "luz", "trevas", "veneno"].map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-2 text-sm text-zinc-300">
        <span>Descrição / efeito do ataque</span>
        <textarea
          className={input}
          rows={3}
          value={value.description || ""}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </label>

      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
        <div>
          <p className="text-lg font-bold text-amber-200">Ilustração do golpe</p>
          <p className="mt-1 text-sm text-zinc-400">
            Opcional. O alvo receberá um botão discreto e temporário para abrir a imagem, mesmo após responder ao ataque.
          </p>
        </div>

        <div className="mt-4 space-y-4">
          <label className="flex flex-col gap-2 text-sm text-zinc-300">
            <span>URL HTTPS ou imagem compacta em data:image/...</span>
            <input
              className={input}
              value={value.previewImageUrl || ""}
              placeholder="https://meu-servidor.com/golpes/ataque.webp"
              onChange={(event) => onChange({ ...value, previewImageUrl: event.target.value })}
            />
          </label>

          <label className="block cursor-pointer rounded-lg border border-dashed border-amber-400/35 px-3 py-3 text-center text-sm text-amber-100 transition hover:bg-amber-400/5">
            Escolher imagem do computador (compactada automaticamente)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (!file) return
                try {
                  const encoded = await fileToCompactImage(file)
                  onChange({ ...value, previewImageUrl: encoded })
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : "Falha ao processar imagem.")
                }
              }}
            />
          </label>

          {!!value.previewImageUrl && (
            <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/30">
              <img
                src={value.previewImageUrl}
                alt="Prévia da imagem do golpe"
                className="max-h-56 w-full object-contain"
              />
              <button
                type="button"
                onClick={() => onChange({ ...value, previewImageUrl: "" })}
                className="absolute right-2 top-2 rounded-md bg-black/80 px-2 py-1 text-xs font-medium text-white"
              >
                Remover imagem
              </button>
            </div>
          )}

          <label className="flex flex-col gap-2 text-sm text-zinc-300">
            <span>Disponibilidade para o jogador (segundos)</span>
            <input
              type="number"
              min={1}
              max={MAX_SPECIAL_ATTACK_PREVIEW_SECONDS}
              step={1}
              className={input}
              value={value.previewDurationSeconds ?? DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS}
              onChange={(event) => {
                const seconds = Number(event.target.value)
                onChange({
                  ...value,
                  previewDurationSeconds: Number.isSafeInteger(seconds) && seconds > 0
                    ? Math.min(seconds, MAX_SPECIAL_ATTACK_PREVIEW_SECONDS)
                    : DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS,
                })
              }}
            />
          </label>

          <p className="text-sm text-zinc-400">
            Padrão: 300 segundos (5 minutos). O tempo começa quando o Mestre dispara o golpe.
          </p>
        </div>
      </div>
    </div>
  )
}
