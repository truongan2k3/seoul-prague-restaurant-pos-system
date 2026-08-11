"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import type { NotePreset } from "@/lib/types";
import {
  createNotePreset,
  deleteNotePreset,
  updateNotePreset,
  type NotePresetInput,
} from "@/src/lib/note-preset-actions";

interface NotePresetFormModalProps {
  open: boolean;
  preset: NotePreset | null;
  onClose: () => void;
  onSave: (input: NotePresetInput) => Promise<void>;
  isSaving: boolean;
}

function NotePresetFormModal({
  open,
  preset,
  onClose,
  onSave,
  isSaving,
}: NotePresetFormModalProps) {
  const { translate } = useApp();
  const [labelEn, setLabelEn] = useState(preset?.labelEn ?? "");
  const [labelCz, setLabelCz] = useState(preset?.labelCz ?? "");
  const [labelZh, setLabelZh] = useState(preset?.labelZh ?? "");
  const [displayOrder, setDisplayOrder] = useState(preset?.displayOrder ?? 0);

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={preset ? translate("editSpecialRequest") : translate("addSpecialRequest")}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold dark:border-gray-700">
            {translate("cancel")}
          </button>
          <button
            type="button"
            disabled={isSaving || !labelEn.trim() || !labelZh.trim()}
            onClick={() =>
              void onSave({
                labelEn: labelEn.trim(),
                labelCz: labelCz.trim() || labelEn.trim(),
                labelZh: labelZh.trim(),
                displayOrder,
                active: true,
              })
            }
            className="flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
          >
            {translate("saveChanges")}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            English
            <input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} className="pos-input mt-1" />
          </label>
          <label className="block text-sm">
            Čeština
            <input value={labelCz} onChange={(e) => setLabelCz(e.target.value)} className="pos-input mt-1" />
          </label>
          <label className="block text-sm">
            中文 (kitchen)
            <input value={labelZh} onChange={(e) => setLabelZh(e.target.value)} className="pos-input mt-1" />
          </label>
        </div>
        <label className="block text-sm">
          Order
          <input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(Number(e.target.value) || 0)}
            className="pos-input mt-1 max-w-[8rem]"
          />
        </label>
      </div>
    </Modal>
  );
}

interface NotePresetManagerProps {
  presets: NotePreset[];
  onChange: () => void;
}

export function NotePresetManager({ presets, onChange }: NotePresetManagerProps) {
  const { translate, logAction } = useApp();
  const { requestPin } = usePinGate();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<NotePreset | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (input: NotePresetInput) => {
    setIsSaving(true);
    setError(null);
    const result = editing
      ? await updateNotePreset(editing.id, input)
      : await createNotePreset(input);
    setIsSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    logAction(editing ? "update special request" : "create special request", input.labelEn);
    setFormOpen(false);
    setEditing(null);
    onChange();
  };

  const handleDelete = (preset: NotePreset) => {
    requestPin(async () => {
      setIsSaving(true);
      const { error: deleteError } = await deleteNotePreset(preset.id);
      setIsSaving(false);
      if (deleteError) {
        setError(deleteError.message);
        return;
      }
      logAction("delete special request", preset.labelEn);
      onChange();
    });
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">{translate("specialRequests")}</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{translate("specialRequestsHint")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-700"
        >
          <Plus className="h-3.5 w-3.5" /> {translate("addSpecialRequest")}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <ul className="mt-4 space-y-2">
        {presets.map((preset) => (
          <li
            key={preset.id}
            className="flex items-center justify-between rounded-lg border px-3 py-2 dark:border-zinc-800"
          >
            <div>
              <p className="text-sm font-medium">
                {preset.labelEn} · {preset.labelCz} · {preset.labelZh}
              </p>
              <p className="text-xs text-zinc-500">#{preset.displayOrder}</p>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => {
                  setEditing(preset);
                  setFormOpen(true);
                }}
                className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(preset)}
                className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
        {presets.length === 0 && (
          <li className="py-4 text-center text-xs text-zinc-500">{translate("noSpecialRequests")}</li>
        )}
      </ul>

      <NotePresetFormModal
        key={editing?.id ?? "new"}
        open={formOpen}
        preset={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
        isSaving={isSaving}
      />
    </section>
  );
}
