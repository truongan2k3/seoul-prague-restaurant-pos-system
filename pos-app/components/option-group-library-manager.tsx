"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import type { MenuOptionChoice, OptionGroupLibraryEntry } from "@/lib/types";
import {
  createOptionGroupLibraryEntry,
  deleteOptionGroupLibraryEntry,
  emptyOptionGroupLibraryInput,
  updateOptionGroupLibraryEntry,
  type OptionGroupLibraryInput,
} from "@/src/lib/option-group-library-actions";

function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function emptyOption(isDefault = false): MenuOptionChoice {
  return {
    id: newId("opt"),
    nameEn: "",
    nameCz: "",
    nameZh: "",
    priceDelta: 0,
    default: isDefault,
  };
}

interface OptionGroupFormModalProps {
  open: boolean;
  entry: OptionGroupLibraryEntry | null;
  onClose: () => void;
  onSave: (input: OptionGroupLibraryInput) => Promise<void>;
  isSaving: boolean;
}

function OptionGroupFormModal({
  open,
  entry,
  onClose,
  onSave,
  isSaving,
}: OptionGroupFormModalProps) {
  const { translate } = useApp();
  const [form, setForm] = useState<OptionGroupLibraryInput>(() =>
    entry
      ? {
          nameEn: entry.nameEn,
          nameCz: entry.nameCz,
          nameZh: entry.nameZh,
          required: entry.required,
          multi: entry.multi,
          options: entry.options.map((option) => ({ ...option })),
          displayOrder: entry.displayOrder,
          active: entry.active,
        }
      : {
          ...emptyOptionGroupLibraryInput,
          options: [emptyOption(true)],
        },
  );

  if (!open) return null;

  const updateOption = (optionId: string, patch: Partial<MenuOptionChoice>) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option) =>
        option.id === optionId ? { ...option, ...patch } : option,
      ),
    }));
  };

  const setDefaultOption = (optionId: string) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option) => ({
        ...option,
        default: option.id === optionId,
      })),
    }));
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={
        entry ? translate("editOptionGroupLibrary") : translate("addOptionGroupLibrary")
      }
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold dark:border-gray-700"
          >
            {translate("cancel")}
          </button>
          <button
            type="button"
            disabled={isSaving || !form.nameEn.trim() || form.options.length === 0}
            onClick={() =>
              void onSave({
                ...form,
                nameEn: form.nameEn.trim(),
                nameCz: form.nameCz.trim() || form.nameEn.trim(),
                nameZh: form.nameZh.trim() || form.nameEn.trim(),
              })
            }
            className="flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
          >
            {translate("saveChanges")}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {(
            [
              ["nameEn", "English"],
              ["nameCz", "Czech"],
              ["nameZh", "Chinese"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              {label}
              <input
                value={form[key]}
                onChange={(event) =>
                  setForm((current) => ({ ...current, [key]: event.target.value }))
                }
                className="pos-input mt-1"
              />
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.required)}
              onChange={(event) =>
                setForm((current) => ({ ...current, required: event.target.checked }))
              }
              className="rounded border-zinc-300"
            />
            {translate("optionGroupRequired")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(form.multi)}
              onChange={(event) =>
                setForm((current) => ({ ...current, multi: event.target.checked }))
              }
              className="rounded border-zinc-300"
            />
            {translate("optionGroupMulti")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active !== false}
              onChange={(event) =>
                setForm((current) => ({ ...current, active: event.target.checked }))
              }
              className="rounded border-zinc-300"
            />
            {translate("optionGroupActive")}
          </label>
          <label className="block text-sm">
            {translate("optionGroupOrder")}
            <input
              type="number"
              value={form.displayOrder ?? 0}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  displayOrder: Number(event.target.value) || 0,
                }))
              }
              className="pos-input mt-1 max-w-[8rem]"
            />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {translate("optionGroupChoices")}
          </p>
          {form.options.map((option) => (
            <div
              key={option.id}
              className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900 md:grid-cols-[1fr_1fr_1fr_88px_auto_auto]"
            >
              {(
                [
                  ["nameEn", "EN"],
                  ["nameCz", "CS"],
                  ["nameZh", "ZH"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="text-[11px] text-zinc-500">{label}</span>
                  <input
                    value={option[key]}
                    onChange={(event) =>
                      updateOption(option.id, { [key]: event.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                  />
                </label>
              ))}
              <label className="block">
                <span className="text-[11px] text-zinc-500">+ Kč</span>
                <input
                  type="number"
                  step={1}
                  value={option.priceDelta ?? 0}
                  onChange={(event) =>
                    updateOption(option.id, {
                      priceDelta: Number(event.target.value) || 0,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                />
              </label>
              <label className="flex items-end gap-1.5 pb-2 text-xs text-zinc-600 dark:text-zinc-300">
                <input
                  type="radio"
                  name={`default-lib-${entry?.id ?? "new"}`}
                  checked={Boolean(option.default)}
                  onChange={() => setDefaultOption(option.id)}
                />
                {translate("optionGroupDefault")}
              </label>
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    options: current.options.filter((entryOption) => entryOption.id !== option.id),
                  }))
                }
                className="self-end rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setForm((current) => ({
                ...current,
                options: [...current.options, emptyOption(current.options.length === 0)],
              }))
            }
            className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200"
          >
            <Plus className="h-3.5 w-3.5" />
            {translate("addOptionChoice")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface OptionGroupLibraryManagerProps {
  entries: OptionGroupLibraryEntry[];
  onChange: () => void;
}

export function OptionGroupLibraryManager({
  entries,
  onChange,
}: OptionGroupLibraryManagerProps) {
  const { translate, logAction } = useApp();
  const { requestPin } = usePinGate();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OptionGroupLibraryEntry | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (input: OptionGroupLibraryInput) => {
    setIsSaving(true);
    setError(null);
    const result = editing
      ? await updateOptionGroupLibraryEntry(editing.id, input)
      : await createOptionGroupLibraryEntry(input);
    setIsSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    logAction(
      editing ? "update option group library" : "create option group library",
      input.nameEn,
    );
    setModalOpen(false);
    setEditing(null);
    onChange();
  };

  const handleDelete = (entry: OptionGroupLibraryEntry) => {
    requestPin(async () => {
      const { error: deleteError } = await deleteOptionGroupLibraryEntry(entry.id);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      logAction("delete option group library", entry.nameEn);
      onChange();
    });
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">
            {translate("optionGroupLibrary")}
          </h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {translate("optionGroupLibraryHint")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Plus className="h-3.5 w-3.5" />
          {translate("addOptionGroupLibrary")}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <ul className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-100 dark:divide-gray-800 dark:border-gray-700">
        {entries.length === 0 ? (
          <li className="py-6 text-center text-xs text-zinc-500">
            {translate("noOptionGroupLibrary")}
          </li>
        ) : (
          entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {entry.nameEn}
                  {!entry.active ? (
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      ({translate("optionGroupInactive")})
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {entry.options.length} {translate("optionGroupChoices").toLowerCase()}
                  {entry.required ? ` · ${translate("optionGroupRequired")}` : ""}
                  {entry.multi ? ` · ${translate("optionGroupMulti")}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(entry);
                  setModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold dark:border-gray-600"
              >
                <Pencil className="h-3.5 w-3.5" />
                {translate("editOptionGroupLibrary")}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(entry)}
                className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))
        )}
      </ul>

      {modalOpen ? (
        <OptionGroupFormModal
          key={editing?.id ?? "new"}
          open
          entry={editing}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
          isSaving={isSaving}
        />
      ) : null}
    </section>
  );
}
