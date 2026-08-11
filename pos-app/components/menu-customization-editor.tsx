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
}

export function MenuCustomizationEditor({ value, onChange }: MenuCustomizationEditorProps) {
  const config: MenuCustomizationConfig = value ?? { optionGroups: [] };
  const groups = config.optionGroups ?? [];
  const hasGroups = groups.length > 0;
  const hasFreeAddOn = Boolean(config.freeAddOn);

  const setConfig = (next: MenuCustomizationConfig | undefined) => {
    if (!next) {
      onChange(undefined);
      return;
    }
    const hasContent =
      (next.optionGroups && next.optionGroups.length > 0) || Boolean(next.freeAddOn);
    onChange(hasContent ? next : undefined);
  };

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
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            Menu option groups
          </span>
          <input
            type="checkbox"
            checked={hasGroups}
            onChange={(event) => {
              if (event.target.checked) {
                setConfig({
                  ...config,
                  optionGroups: groups.length > 0 ? groups : [emptyGroup()],
                });
              } else {
                setConfig({
                  ...config,
                  optionGroups: [],
                  freeAddOn: config.freeAddOn,
                });
              }
            }}
            className="h-4 w-4 rounded border-zinc-300"
          />
        </label>

        <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-700">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            Free add-on
          </span>
          <input
            type="checkbox"
            checked={hasFreeAddOn}
            onChange={(event) => {
              if (event.target.checked) {
                setConfig({
                  ...config,
                  freeAddOn: config.freeAddOn ?? {
                    nameEn: "Free add-on",
                    nameCz: "Přídavek zdarma",
                    nameZh: "免费加料",
                  },
                });
              } else {
                const { freeAddOn: _removed, ...rest } = config;
                setConfig({ ...rest, optionGroups: groups });
              }
            }}
            className="h-4 w-4 rounded border-zinc-300"
          />
        </label>
      </div>

      {hasFreeAddOn && config.freeAddOn && (
        <div className="grid gap-2 rounded-xl border border-zinc-200 p-3 md:grid-cols-3 dark:border-zinc-700">
          {(
            [
              ["nameEn", "English"],
              ["nameCz", "Czech"],
              ["nameZh", "Chinese"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-[11px] text-zinc-500">{label}</span>
              <input
                value={config.freeAddOn?.[key] ?? ""}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    freeAddOn: {
                      ...config.freeAddOn!,
                      [key]: event.target.value,
                    },
                  })
                }
                className="mt-1 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
              />
            </label>
          ))}
        </div>
      )}

      {hasGroups && (
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={Boolean(config.basePriceFromOptions)}
              onChange={(event) =>
                setConfig({ ...config, basePriceFromOptions: event.target.checked })
              }
              className="rounded border-zinc-300"
            />
            Base price comes from selected option
          </label>

          {groups.map((group) => (
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
                        value={group[key]}
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
                      optionGroups: groups.filter((entry) => entry.id !== group.id),
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
                      Default
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
                Add option (+ price)
              </button>
            </div>
          ))}

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
        </div>
      )}
    </div>
  );
}
