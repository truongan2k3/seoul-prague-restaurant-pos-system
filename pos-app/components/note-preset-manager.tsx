"use client";

import { useMemo, useState } from "react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import type { NotePreset } from "@/lib/types";
import {
  createNotePreset,
  deleteNotePreset,
  updateNotePreset,
  updateNotePresetOrder,
  type NotePresetInput,
} from "@/src/lib/note-preset-actions";

function nextDisplayOrder(presets: NotePreset[]): number {
  if (presets.length === 0) return 1;
  return Math.max(...presets.map((preset) => preset.displayOrder ?? 0)) + 1;
}

function reorderPresets(
  list: NotePreset[],
  fromIndex: number,
  toIndex: number,
): NotePreset[] {
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((preset, index) => ({ ...preset, displayOrder: index + 1 }));
}

interface NotePresetFormModalProps {
  open: boolean;
  preset: NotePreset | null;
  /** Used when creating so new cards land at the end instead of order 0. */
  defaultDisplayOrder: number;
  onClose: () => void;
  onSave: (input: NotePresetInput) => Promise<void>;
  isSaving: boolean;
}

function NotePresetFormModal({
  open,
  preset,
  defaultDisplayOrder,
  onClose,
  onSave,
  isSaving,
}: NotePresetFormModalProps) {
  const { translate } = useApp();
  const [labelEn, setLabelEn] = useState(preset?.labelEn ?? "");
  const [labelCz, setLabelCz] = useState(preset?.labelCz ?? "");
  const [labelZh, setLabelZh] = useState(preset?.labelZh ?? "");

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={preset ? translate("editSpecialRequest") : translate("addSpecialRequest")}
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
            disabled={isSaving || !labelEn.trim() || !labelZh.trim()}
            onClick={() =>
              void onSave({
                labelEn: labelEn.trim(),
                labelCz: labelCz.trim() || labelEn.trim(),
                labelZh: labelZh.trim(),
                displayOrder: preset?.displayOrder ?? defaultDisplayOrder,
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
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{translate("dragToReorder")}</p>
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
  const [drafts, setDrafts] = useState<NotePreset[] | null>(null);

  const sortedPresets = useMemo(() => {
    const source = drafts ?? presets;
    return [...source].sort((a, b) => {
      const orderDiff = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return a.labelEn.localeCompare(b.labelEn);
    });
  }, [drafts, presets]);

  const createOrder = nextDisplayOrder(presets);

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
    setDrafts(null);
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
      setDrafts(null);
      onChange();
    }, { force: true });
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    if (result.source.index === result.destination.index) return;

    const next = reorderPresets(
      sortedPresets,
      result.source.index,
      result.destination.index,
    );
    setDrafts(next);

    const changed = next.filter((preset) => {
      const previous = presets.find((entry) => entry.id === preset.id);
      return previous && previous.displayOrder !== preset.displayOrder;
    });
    if (changed.length === 0) return;

    setIsSaving(true);
    setError(null);
    const { error: reorderError } = await updateNotePresetOrder(
      next.map((preset) => ({ id: preset.id, displayOrder: preset.displayOrder })),
    );
    setIsSaving(false);

    if (reorderError) {
      setError(reorderError.message);
      setDrafts(null);
      return;
    }

    setDrafts(null);
    onChange();
  };

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">{translate("specialRequests")}</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {translate("specialRequestsHint")} · {translate("dragToReorder")}
          </p>
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

      <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
        {sortedPresets.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-zinc-500">{translate("noSpecialRequests")}</p>
        ) : (
          <DragDropContext onDragEnd={(result) => void handleDragEnd(result)}>
            <Droppable droppableId="special-requests">
              {(provided) => (
                <ul
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="divide-y divide-zinc-100 dark:divide-zinc-800"
                >
                  {sortedPresets.map((preset, index) => (
                    <Draggable
                      key={preset.id}
                      draggableId={preset.id}
                      index={index}
                      isDragDisabled={isSaving}
                    >
                      {(dragProvided, snapshot) => (
                        <li
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={`flex items-center gap-3 px-3 py-2 ${
                            snapshot.isDragging
                              ? "bg-zinc-100 shadow-lg dark:bg-zinc-800"
                              : ""
                          }`}
                        >
                          <button
                            type="button"
                            {...dragProvided.dragHandleProps}
                            disabled={isSaving}
                            className="touch-action-none shrink-0 cursor-grab rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing disabled:opacity-40 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                            aria-label={`${translate("dragToReorder")}: ${preset.labelEn}`}
                          >
                            <GripVertical className="h-4 w-4" />
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {preset.labelEn} · {preset.labelCz} · {preset.labelZh}
                            </p>
                          </div>
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
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      <NotePresetFormModal
        key={editing?.id ?? "new"}
        open={formOpen}
        preset={editing}
        defaultDisplayOrder={createOrder}
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
