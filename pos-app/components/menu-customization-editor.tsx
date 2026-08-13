"use client";

import { Plus, Trash2 } from "lucide-react";
import type {
  MenuCustomizationConfig,
  MenuOptionChoice,
  MenuOptionGroup,
  NotePreset,
  OptionGroupLibraryEntry,
} from "@/lib/types";
import { useApp } from "@/contexts/app-context";
import { presetLabel } from "@/lib/note-presets";

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

function emptyGroup(): MenuOptionGroup {
  return {
    id: newId("grp"),
    nameEn: "Options",
    nameCz: "Možnosti",
    nameZh: "选项",
    required: true,
    options: [emptyOption(true)],
  };
}

interface MenuCustomizationEditorProps {
  value?: MenuCustomizationConfig;
  onChange: (value: MenuCustomizationConfig | undefined) => void;
  libraryGroups?: OptionGroupLibraryEntry[];
  notePresets?: NotePreset[];
}

export function MenuCustomizationEditor({
  value,
  onChange,
  libraryGroups = [],
  notePresets = [],
}: MenuCustomizationEditorProps) {
  const { translate, language } = useApp();
  const config: MenuCustomizationConfig = value ?? { optionGroups: [] };
  const libraryIds = config.optionGroupLibraryIds ?? [];
  const libraryIdSet = new Set(libraryIds);
  const inlineGroups = (config.optionGroups ?? []).filter(
    (group) => !libraryIdSet.has(group.id),
  );
  const hasInlineGroups = inlineGroups.length > 0;
  const restrictSpecialRequests = config.allowedSpecialRequestIds != null;
  const allowedSpecialRequestIds = config.allowedSpecialRequestIds ?? [];
  const activeLibrary = libraryGroups.filter((entry) => entry.active);

  const setConfig = (next: MenuCustomizationConfig | undefined) => {
    if (!next) {
      onChange(undefined);
      return;
    }
    const hasContent =
      (next.optionGroups && next.optionGroups.length > 0) ||
      (next.optionGroupLibraryIds && next.optionGroupLibraryIds.length > 0) ||
      next.allowedSpecialRequestIds != null;
    onChange(hasContent ? next : undefined);
  };

  const toggleLibraryGroup = (groupId: string) => {
    const nextIds = libraryIds.includes(groupId)
      ? libraryIds.filter((id) => id !== groupId)
      : [...libraryIds, groupId];
    setConfig({
      ...config,
      optionGroupLibraryIds: nextIds.length > 0 ? nextIds : undefined,
      optionGroups: inlineGroups,
    });
  };

  const updateGroup = (groupId: string, patch: Partial<MenuOptionGroup>) => {
    setConfig({
      ...config,
      optionGroups: inlineGroups.map((group) =>
        group.id === groupId ? { ...group, ...patch } : group,
      ),
      optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
    });
  };

  const updateOption = (
    groupId: string,
    optionId: string,
    patch: Partial<MenuOptionChoice>,
  ) => {
    setConfig({
      ...config,
      optionGroups: inlineGroups.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          options: group.options.map((option) =>
            option.id === optionId ? { ...option, ...patch } : option,
          ),
        };
      }),
      optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
    });
  };

  const setDefaultOption = (groupId: string, optionId: string) => {
    setConfig({
      ...config,
      optionGroups: inlineGroups.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          options: group.options.map((option) => ({
            ...option,
            default: option.id === optionId,
          })),
        };
      }),
      optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {translate("attachOptionGroups")}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {translate("attachOptionGroupsHint")}
          </p>
        </div>
        {activeLibrary.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700">
            {translate("noOptionGroupLibrary")}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {activeLibrary.map((entry) => {
              const checked = libraryIds.includes(entry.id);
              return (
                <label
                  key={entry.id}
                  className="flex min-h-[48px] cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLibraryGroup(entry.id)}
                    className="mt-1 h-4 w-4 rounded border-zinc-300"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {entry.nameEn}
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      {entry.options.length} {translate("optionGroupChoices").toLowerCase()}
                      {entry.required ? ` · ${translate("optionGroupRequired")}` : ""}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <div>
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {translate("attachSpecialRequests")}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {translate("attachSpecialRequestsHint")}
          </p>
        </div>
        <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={restrictSpecialRequests}
            onChange={(event) => {
              if (event.target.checked) {
                setConfig({
                  ...config,
                  optionGroups: inlineGroups,
                  optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
                  allowedSpecialRequestIds: [],
                });
              } else {
                setConfig({
                  ...config,
                  optionGroups: inlineGroups,
                  optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
                  allowedSpecialRequestIds: undefined,
                });
              }
            }}
            className="rounded border-zinc-300"
          />
          {translate("restrictSpecialRequests")}
        </label>
        {restrictSpecialRequests && (
          notePresets.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-zinc-700">
              {translate("noSpecialRequests")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {notePresets.map((preset) => {
                const active = allowedSpecialRequestIds.includes(preset.id);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? allowedSpecialRequestIds.filter((id) => id !== preset.id)
                        : [...allowedSpecialRequestIds, preset.id];
                      setConfig({
                        ...config,
                        optionGroups: inlineGroups,
                        optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
                        allowedSpecialRequestIds: next,
                      });
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-emerald-600 text-white"
                        : "border border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
                    }`}
                  >
                    {presetLabel(preset, language)}
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
        <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {translate("inlineOptionGroups")}
          </span>
          <input
            type="checkbox"
            checked={hasInlineGroups}
            onChange={(event) => {
              if (event.target.checked) {
                setConfig({
                  ...config,
                  optionGroups: inlineGroups.length > 0 ? inlineGroups : [emptyGroup()],
                  optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
                });
              } else {
                setConfig({
                  ...config,
                  optionGroups: [],
                  optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
                  allowedSpecialRequestIds: config.allowedSpecialRequestIds,
                });
              }
            }}
            className="h-4 w-4 rounded border-zinc-300"
          />
        </label>
      </div>

      {(libraryIds.length > 0 || hasInlineGroups) && (
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={Boolean(config.basePriceFromOptions)}
            onChange={(event) =>
              setConfig({
                ...config,
                optionGroups: inlineGroups,
                optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
                basePriceFromOptions: event.target.checked,
              })
            }
            className="rounded border-zinc-300"
          />
          {translate("basePriceFromOptions")}
        </label>
      )}

      {hasInlineGroups && (
        <div className="space-y-4">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {translate("inlineOptionGroupsHint")}
          </p>
          {inlineGroups.map((group) => (
            <div
              key={group.id}
              className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/40"
            >
              <div className="flex items-start gap-2">
                <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-3">
                  {(
                    [
                      ["nameEn", "Group EN"],
                      ["nameCz", "Group CS"],
                      ["nameZh", "Group ZH"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-[11px] text-zinc-500">{label}</span>
                      <input
                        value={group[key] ?? ""}
                        onChange={(event) => updateGroup(group.id, { [key]: event.target.value })}
                        className="mt-1 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setConfig({
                      ...config,
                      optionGroups: inlineGroups.filter((entry) => entry.id !== group.id),
                      optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
                    })
                  }
                  className="mt-5 rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2">
                {group.options.map((option) => (
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
                            updateOption(group.id, option.id, { [key]: event.target.value })
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
                          updateOption(group.id, option.id, {
                            priceDelta: Number(event.target.value) || 0,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </label>
                    <label className="flex items-end gap-1.5 pb-2 text-xs text-zinc-600 dark:text-zinc-300">
                      <input
                        type="radio"
                        name={`default-${group.id}`}
                        checked={Boolean(option.default)}
                        onChange={() => setDefaultOption(group.id, option.id)}
                      />
                      {translate("optionGroupDefault")}
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        updateGroup(group.id, {
                          options: group.options.filter((entry) => entry.id !== option.id),
                        })
                      }
                      className="self-end rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() =>
                  updateGroup(group.id, {
                    options: [...group.options, emptyOption(group.options.length === 0)],
                  })
                }
                className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200"
              >
                <Plus className="h-3.5 w-3.5" />
                {translate("addOptionChoice")}
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setConfig({
                ...config,
                optionGroups: [...inlineGroups, emptyGroup()],
                optionGroupLibraryIds: libraryIds.length > 0 ? libraryIds : undefined,
              })
            }
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs font-semibold dark:border-zinc-600"
          >
            <Plus className="h-3.5 w-3.5" />
            {translate("addInlineOptionGroup")}
          </button>
        </div>
      )}
    </div>
  );
}
