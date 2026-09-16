"use client"
import { useState } from "react"
import {
  formatWeight,
  itemWeightGrams,
  weightFields,
  type ItemWeight,
} from "@/lib/inventory-weight"
export function ItemWeightField({
  value,
  onChange,
  disabled,
}: {
  value: ItemWeight
  onChange: (value: ItemWeight) => void
  disabled?: boolean
}) {
  return (
    <fieldset
      disabled={disabled}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-white/15 p-3"
    >
      <label className="flex flex-1 flex-col gap-1 text-sm">
        Peso
        <input
          aria-label="Peso do item"
          type="number"
          min="0"
          step={value.weightUnit === "kg" ? "0.001" : "1"}
          value={value.weight ?? 100}
          onChange={(e) =>
            onChange({
              ...value,
              weight:
                e.target.value === "" ? undefined : Number(e.target.value),
              weightUnit: value.weightUnit || "g",
            })
          }
          className="min-w-0 rounded bg-zinc-900 p-2 text-white"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Unidade
        <select
          aria-label="Unidade do peso"
          value={value.weightUnit || "g"}
          onChange={(e) => {
            const unit = e.target.value as "g" | "kg"
            const grams = itemWeightGrams(value)
            onChange({
              ...value,
              weight: unit === "kg" ? grams / 1000 : grams,
              weightUnit: unit,
            })
          }}
          className="rounded bg-zinc-900 p-2 text-white"
        >
          <option value="g">g</option>
          <option value="kg">kg</option>
        </select>
      </label>
    </fieldset>
  )
}
export function CustomItemWeightEditor({
  item,
  onSave,
  disabled,
}: {
  item: ItemWeight
  onSave: (weight: Required<ItemWeight>) => Promise<unknown>
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState<ItemWeight>(item),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("")
  return (
    <div className="mt-2 space-y-2 text-sm">
      <p>
        Peso: {formatWeight(itemWeightGrams(item))}
        {item.weight === undefined ? " (padrão: 100 g)" : ""}
      </p>
      {!editing ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setDraft({
              weight: item.weight ?? 100,
              weightUnit: item.weightUnit || "g",
            })
            setEditing(true)
          }}
          className="rounded border border-white/20 px-3 py-2"
        >
          Editar peso
        </button>
      ) : (
        <>
          <ItemWeightField
            value={draft}
            onChange={setDraft}
            disabled={saving}
          />
          <button
            type="button"
            disabled={saving || disabled}
            className="rounded bg-amber-300 px-3 py-2 text-black"
            onClick={async () => {
              setSaving(true)
              setError("")
              try {
                await onSave(weightFields(draft.weight, draft.weightUnit))
                setEditing(false)
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Não foi possível salvar o peso.",
                )
              } finally {
                setSaving(false)
              }
            }}
          >
            Salvar peso
          </button>
          <button
            type="button"
            disabled={saving}
            className="ml-2 px-3 py-2"
            onClick={() => setEditing(false)}
          >
            Cancelar
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
