"use client";

import { Plus, Trash2 } from "lucide-react";
import type { MenuCustomizationConfig, MenuOptionChoice, MenuOptionGroup } from "@/lib/types";

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
    nameEn: "Special Requests",
    nameCz: "Speciální požadavky",
    nameZh: "特殊要求",
    required: true,
    options: [emptyOption(true)],
  };
}

interface MenuCustomizationEditorProps {
  value?: MenuCustomizationConfig;
  onChange: (value: MenuCustomizationConfig | undefined) => void;
}

export function MenuCustomizationEditor({ value, onChange }: MenuCustomizationEditorProps) {
  const enabled = Boolean(value && (value.optionGroups?.length || value.freeAddOn));
  const config: MenuCustomizationConfig = value ?? { optionGroups: [] };
  const groups = config.optionGroups ?? [];

  const setConfig = (next: MenuCustomizationConfig | undefined) => {
    if (!next) {
      onChange(undefined);
      return;
    }
    const hasContent =
      (next.optionGroups && next.optionGroups.length > 0) || Boolean(next.freeAddOn);
    onChange(hasContent ? next : undefined);
  };

  const enable = () => {
    setConfig({
      basePriceFromOptions: false,
      optionGroups: [emptyGroup()],
    });
  };

  const disable = () => setConfig(undefined);

  const updateGroup = (groupId: string, patch: Partial<MenuOptionGroup>) => {
    setConfig({
      ...config,
      optionGroups: groups.map((group) =>
        group.id === groupId ? { ...group, ...patch } : group,
      ),
    });
  };

  const updateOption = (
    groupId: string,
    optionId: string,
    patch: Partial<MenuOptionChoice>,
  ) => {
    setConfig({
      ...config,
      optionGroups: groups.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          options: group.options.map((option) =>
            option.id === optionId ? { ...option, ...patch } : option,
          ),
        };
      }),
    });
  };

  const setDefaultOption = (groupId: string, optionId: string) => {
    setConfig({
      ...config,
      optionGroups: groups.map((group) => {
        if (group.id !== groupId) return group;
        return {
          ...group,
          options: group.options.map((option) => ({
            ...option,
            default: option.id === optionId,
          })),
        };
      }),
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Option groups / Add-ons
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            e.g. Special Requests — “Thêm bò” with +50 Kč surcharge.
          </p>
        </div>
        {enabled ? (
          <button
            type="button"
            onClick={disable}
            className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium dark:border-zinc-600"
          >
            Remove
          </button>
        ) : (
          <button
            type="button"
            onClick={enable}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            <Plus className="h-3.5 w-3.5" />
            Add options
          </button>
        )}
      </div>

      {enabled && (
        <>
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(config.basePriceFromOptions)}
              onChange={(event) =>
                setConfig({ ...config, basePriceFromOptions: event.target.checked })
              }
              className="rounded border-zinc-300"
            />
            Base price comes from selected option (lunch protein style)
          </label>

          <div className="space-y-4">
            {groups.map((group, groupIndex) => (
              <div
                key={group.id}
                className="space-y-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <label className="min-w-[140px] flex-1">
                    <span className="text-[11px] font-medium text-zinc-500">Group name (EN)</span>
                    <input
                      value={group.nameEn}
                      onChange={(event) => {
                        const nameEn = event.target.value;
                        updateGroup(group.id, {
                          nameEn,
                          nameCz: group.nameCz || nameEn,
                          nameZh: group.nameZh || nameEn,
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                      placeholder="Special Requests"
                    />
                  </label>
                  <label className="min-w-[120px] flex-1">
                    <span className="text-[11px] font-medium text-zinc-500">Name (CZ)</span>
                    <input
                      value={group.nameCz}
                      onChange={(event) => updateGroup(group.id, { nameCz: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setConfig({
                        ...config,
                        optionGroups: groups.filter((entry) => entry.id !== group.id),
                      })
                    }
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                    aria-label={`Remove group ${groupIndex + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {group.options.map((option) => (
                    <div
                      key={option.id}
                      className="grid grid-cols-[1fr_1fr_88px_auto_auto] items-end gap-2"
                    >
                      <label>
                        <span className="text-[11px] font-medium text-zinc-500">Option (EN)</span>
                        <input
                          value={option.nameEn}
                          onChange={(event) => {
                            const nameEn = event.target.value;
                            updateOption(group.id, option.id, {
                              nameEn,
                              nameCz: option.nameCz || nameEn,
                              nameZh: option.nameZh || nameEn,
                            });
                          }}
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                          placeholder="Extra beef"
                        />
                      </label>
                      <label>
                        <span className="text-[11px] font-medium text-zinc-500">Option (CZ)</span>
                        <input
                          value={option.nameCz}
                          onChange={(event) =>
                            updateOption(group.id, option.id, { nameCz: event.target.value })
                          }
                          className="mt-1 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
                          placeholder="Thêm bò"
                        />
                      </label>
                      <label>
                        <span className="text-[11px] font-medium text-zinc-500">+ Kč</span>
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
                      <label className="flex h-9 items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                        <input
                          type="radio"
                          name={`default-${group.id}`}
                          checked={Boolean(option.default)}
                          onChange={() => setDefaultOption(group.id, option.id)}
                        />
                        Default
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          updateGroup(group.id, {
                            options: group.options.filter((entry) => entry.id !== option.id),
                          })
                        }
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                        aria-label="Remove option"
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
                  Add option
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              setConfig({
                ...config,
                optionGroups: [...groups, emptyGroup()],
              })
            }
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs font-semibold dark:border-zinc-600"
          >
            <Plus className="h-3.5 w-3.5" />
            Add option group
          </button>
        </>
      )}
    </div>
  );
}
