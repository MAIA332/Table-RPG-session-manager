"use client"
import { useEffect, useState, type ReactNode } from "react"
import {
  ATTRIBUTES,
  newAbility,
  type Ability,
  type Attack,
  type Attribute,
  DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS,
  type Cost,
} from "@/lib/combat-model"
import { QTE_CHECKS } from "@/lib/combat-checks"
import { createClientId } from "@/lib/client-id"
const input =
  "w-full min-w-0 rounded-lg border border-white/15 bg-zinc-900 p-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-xs text-zinc-300">
      {title}
      {children}
    </label>
  )
}
function AttackPreviewFields({
  value,
  onChange,
}: {
  value: Attack
  onChange: (attack: Attack) => void
}) {
  return (
    <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div>
        <p className="text-sm font-bold text-amber-200">Ilustração do golpe</p>
        <p className="mt-1 text-xs text-zinc-400">
          Opcional. O alvo receberá um botão discreto e temporário para abrir a imagem, mesmo após responder ao ataque.
        </p>
      </div>
      <Field title="URL HTTPS ou imagem compacta em data:image/...">
        <input
          className={input}
          value={value.previewImageUrl || ""}
          placeholder="https://meu-servidor.com/golpes/ataque.webp"
          onChange={event => onChange({ ...value, previewImageUrl: event.target.value })}
        />
      </Field>
      <label className="block cursor-pointer rounded-lg border border-dashed border-primary/40 px-3 py-2 text-center text-xs text-amber-100 hover:bg-primary/10">
        Escolher imagem do computador (compactada automaticamente)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          className="sr-only"
          onChange={async event => {
            const file = event.target.files?.[0]
            if (!file) return
            event.target.value = ""
            try {
              if (file.size > 12_000_000) throw new Error("Arquivo muito grande (máximo 12 MB antes da compactação).")
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
              if (encoded.length > 650_000) throw new Error("Imagem ainda muito grande. Use uma URL HTTPS para preservar a qualidade.")
              onChange({ ...value, previewImageUrl: encoded })
            } catch (error) {
              window.alert(error instanceof Error ? error.message : "Falha ao processar imagem.")
            }
          }}
        />
      </label>
      {!!value.previewImageUrl && (
        <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/35">
          <img
            src={value.previewImageUrl}
            alt="Prévia da imagem do golpe"
            className="max-h-44 w-full object-contain"
          />
          <button
            type="button"
            onClick={() => onChange({ ...value, previewImageUrl: "" })}
            className="absolute right-2 top-2 rounded-md bg-black/80 px-2 py-1 text-xs text-white"
          >
            Remover imagem
          </button>
        </div>
      )}
      <Field title="Disponibilidade para o jogador (segundos)">
        <input
          type="number"
          min={1}
          max={86400}
          step={1}
          className={input}
          value={value.previewDurationSeconds ?? DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS}
          onChange={event => {
            const seconds = Number(event.target.value)
            onChange({
              ...value,
              previewDurationSeconds: Number.isSafeInteger(seconds) && seconds > 0
                ? seconds
                : DEFAULT_SPECIAL_ATTACK_PREVIEW_SECONDS,
            })
          }}
        />
      </Field>
      <p className="text-xs text-zinc-400">
        Padrão: 300 segundos (5 minutos). O tempo começa quando o Mestre dispara o golpe.
      </p>
    </div>
  )
}

export function AttackEditor({
  value,
  onChange,
  maxDice = 2,
  allowPreviewConfig = true,
}: {
  value: Attack
  onChange: (attack: Attack) => void
  /** Ataques comuns permanecem com dois dados; bestiário permite até dez. */
  maxDice?: number
  /** Quando falso, oculta os controles de imagem temporária do golpe. */
  allowPreviewConfig?: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Field title="Nome do ataque">
        <input
          className={input}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Field>
      <fieldset className="min-w-0">
        <legend className="mb-2 text-xs text-zinc-300">
          Fórmula de acerto
        </legend>
        <div className="flex flex-wrap gap-1 items-center">
          {Array.from({ length: maxDice > 2 ? value.attributes.length : 2 }, (_, i) => i).map((i) => (
            <select
              key={i}
              aria-label={`Atributo ${i + 1} do acerto`}
              className={input}
              value={value.attributes[i]}
              onChange={(e) => {
                const attributes = [...value.attributes]
                attributes[i] = e.target.value as Attribute
                onChange({ ...value, attributes })
              }}
            >
              {ATTRIBUTES.map((a) => (
                <option key={a} value={a}>
                  {a.toUpperCase()}
                </option>
              ))}
            </select>
          ))}
        </div>
        {maxDice > 2 && <div className="mt-2 flex gap-2">
          <button type="button" disabled={value.attributes.length <= 1}
            onClick={() => onChange({ ...value, attributes: value.attributes.slice(0, -1) })}
            className="rounded-md border border-white/20 px-2 py-1 text-xs disabled:opacity-40">− Dado</button>
          <button type="button" disabled={value.attributes.length >= maxDice}
            onClick={() => onChange({ ...value, attributes: [...value.attributes, "mig"] })}
            className="rounded-md border border-amber-400/30 px-2 py-1 text-xs text-amber-200 disabled:opacity-40">+ Dado</button>
          <span className="self-center text-[11px] text-zinc-400">{value.attributes.length}/{maxDice}</span>
        </div>}
      </fieldset>
      <Field title="Alvo do ataque">
        <select
          className={input}
          value={value.targetDefense}
          onChange={(e) =>
            onChange({
              ...value,
              targetDefense: e.target.value as Attack["targetDefense"],
            })
          }
        >
          <option value="physical">Defesa Física</option>
          <option value="magical">Defesa Mágica</option>
        </select>
      </Field>
      <Field title="Dano fixo ou dados">
        <input
          className={input}
          value={value.damage}
          placeholder="10 ou 2d6+2"
          onChange={(e) => onChange({ ...value, damage: e.target.value })}
        />
      </Field>
      <Field title="Tipo de dano">
        <select
          className={input}
          value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value })}
        >
          {[
            "físico",
            "fogo",
            "gelo",
            "raio",
            "ar",
            "terra",
            "luz",
            "trevas",
            "veneno",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2 xl:col-span-5">
        <Field title="Descrição / efeito do ataque">
          <textarea className={input} rows={2} value={value.description || ""} onChange={e => onChange({ ...value, description: e.target.value })} />
        </Field>
      </div>
      {allowPreviewConfig && (
        <div className="sm:col-span-2 xl:col-span-5">
          <AttackPreviewFields value={value} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
function CostEditor({
  cost,
  onChange,
}: {
  cost: Cost
  onChange: (c: Cost) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field title="Custo">
        <input
          type="number"
          min={0}
          step={1}
          className={input}
          value={cost.amount}
          onChange={(e) =>
            onChange({ ...cost, amount: e.target.valueAsNumber })
          }
        />
      </Field>
      <Field title="Recurso">
        <select
          className={input}
          value={cost.resource}
          onChange={(e) =>
            onChange({ ...cost, resource: e.target.value as Cost["resource"] })
          }
        >
          <option value="mp">MP</option>
          <option value="token">Tokens de Ação</option>
        </select>
      </Field>
    </div>
  )
}
export function AbilityEditor({
  value,
  onChange,
  focusId,
}: {
  value: Ability[]
  onChange: (abilities: Ability[]) => void
  focusId?: string
  /** Preserva compatibilidade com o editor do Bestiário. */
  creatureDice?: Partial<Record<Attribute, string>>
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => {
    if (focusId) setOpenId(focusId)
  }, [focusId])
  const patch = (a: Ability) =>
    onChange(value.map((item) => (item.id === a.id ? a : item)))
  return (
    <section className="space-y-3">
      <h3 className="font-bold text-amber-200">Habilidades</h3>
      {!value.length && (
        <p className="rounded-lg border border-dashed border-white/20 p-5 text-sm text-zinc-400">
          Adicione ataques, passivas ou eventos de reação rápida.
        </p>
      )}
      {value.map((a, i) => (
        <article
          key={a.id}
          className="rounded-xl border border-white/15 bg-zinc-950 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex-1 text-left font-semibold text-white"
              aria-expanded={openId === a.id}
              aria-controls={`ability-${a.id}`}
              onClick={() => setOpenId(openId === a.id ? null : a.id)}
            >
              {openId === a.id ? "▾" : "▸"} {i + 1}. {a.name || "Sem nome"}{" "}
              <span className="ml-2 text-xs text-zinc-400">
                {a.kind === "attack"
                  ? "Ataque / Magia"
                  : a.kind === "passive"
                    ? "Passiva"
                    : "Área / QTE"}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Remover ${a.name}`}
              className="p-2 text-sm text-red-300"
              onClick={() => {
                if (window.confirm(`Remover ${a.name}?`))
                  onChange(value.filter((item) => item.id !== a.id))
              }}
            >
              Remover
            </button>
          </div>
          {openId === a.id && (
            <div id={`ability-${a.id}`} className="mt-4 space-y-4">
              <Field title="Tipo de habilidade">
                <select
                  className={input}
                  value={a.kind}
                  onChange={(e) => {
                    const kind = e.target.value as Ability["kind"]
                    if (
                      window.confirm(
                        "Trocar o tipo redefine os campos específicos desta habilidade. Continuar?",
                      )
                    )
                      patch({ ...newAbility(kind, a.id), name: a.name })
                  }}
                >
                  <option value="attack">Ataque / Magia</option>
                  <option value="passive">Passiva</option>
                  <option value="qte">Ação de Área / QTE</option>
                </select>
              </Field>
              <Field title="Nome da habilidade">
                <input
                  className={input}
                  value={a.name}
                  onChange={(e) => patch({ ...a, name: e.target.value })}
                />
              </Field>
              {a.kind === "attack" && (
                <>
                  <CostEditor
                    cost={a.cost}
                    onChange={(cost) => patch({ ...a, cost })}
                  />
                  <AttackEditor
                    value={a.attack}
                    maxDice={10}
                    allowPreviewConfig
                    onChange={(attack) => patch({ ...a, attack })}
                  />
                </>
              )}
              {a.kind === "passive" && (
                <>
                  <Field title="Gatilho">
                    <input
                      className={input}
                      placeholder="Ex.: ao receber dano de fogo"
                      value={a.trigger}
                      onChange={(e) => patch({ ...a, trigger: e.target.value })}
                    />
                  </Field>
                  <Field title="Descrição do efeito">
                    <textarea
                      className={input}
                      rows={3}
                      value={a.effect}
                      onChange={(e) => patch({ ...a, effect: e.target.value })}
                    />
                  </Field>
                </>
              )}
              {a.kind === "qte" && (
                <>
                  <CostEditor
                    cost={a.cost}
                    onChange={(cost) => patch({ ...a, cost })}
                  />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field title="Tempo de reação">
                      <select
                        className={input}
                        value={a.seconds}
                        onChange={(e) =>
                          patch({
                            ...a,
                            seconds: Number(e.target.value) as typeof a.seconds,
                          })
                        }
                      >
                        {[5, 7, 10, 15, 20].map((t) => (
                          <option key={t} value={t}>
                            {t}s
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field title="Teste exigido">
                      <select
                        className={input}
                        value={a.checkId}
                        onChange={(e) =>
                          patch({ ...a, checkId: e.target.value })
                        }
                      >
                        {QTE_CHECKS.map((check) => (
                          <option key={check.id} value={check.id}>
                            {check.name} (
                            {check.attrs.join(" + ").toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field title="Dificuldade alvo">
                      <input
                        className={input}
                        type="number"
                        min={0}
                        step={1}
                        value={a.difficulty}
                        onChange={(e) =>
                          patch({ ...a, difficulty: e.target.valueAsNumber })
                        }
                      />
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-3 rounded-lg border border-red-400/30 p-3">
                      <Field title="Dano na falha">
                        <input
                          className={input}
                          value={a.failureDamage}
                          onChange={(e) =>
                            patch({ ...a, failureDamage: e.target.value })
                          }
                        />
                      </Field>
                      <Field title="Efeito na falha">
                        <input
                          className={input}
                          value={a.failureEffect}
                          onChange={(e) =>
                            patch({ ...a, failureEffect: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <div className="space-y-3 rounded-lg border border-emerald-400/30 p-3">
                      <Field title="Dano no sucesso">
                        <input
                          className={input}
                          value={a.successDamage}
                          onChange={(e) =>
                            patch({ ...a, successDamage: e.target.value })
                          }
                        />
                      </Field>
                      <Field title="Efeito no sucesso">
                        <input
                          className={input}
                          value={a.successEffect}
                          onChange={(e) =>
                            patch({ ...a, successEffect: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </article>
      ))}
      <button
        type="button"
        className="w-full rounded-xl border border-dashed border-amber-300/50 p-4 font-semibold text-amber-200 hover:bg-amber-200/10 focus-visible:ring-2"
        onClick={() => {
          const a = newAbility("attack", createClientId())
          onChange([...value, a])
          setOpenId(a.id)
        }}
      >
        + Adicionar Nova Habilidade
      </button>
    </section>
  )
}
