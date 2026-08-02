/** Resolve checkbox selection to item IDs. Never cancels the whole ticket unless explicitly selected. */
export function resolveSelectedItemIds(
  tableItems: { id?: string }[],
  selectedIds: Set<string>,
): string[] {
  const ids = tableItems.map((item) => item.id).filter((id): id is string => Boolean(id));
  return ids.filter((id) => selectedIds.has(id));
}

/** Selected IDs matching status, or all items with that status when nothing selected. */
export function resolveActionItemIds<T extends { id?: string; status?: string }>(
  tableItems: T[],
  selectedIds: Set<string>,
  matchesStatus: (item: T) => boolean,
): string[] {
  const selected = resolveSelectedItemIds(tableItems, selectedIds).filter((id) => {
    const item = tableItems.find((row) => row.id === id);
    return item && matchesStatus(item);
  });

  if (selected.length > 0) return selected;

  return tableItems
    .filter((item) => item.id && matchesStatus(item))
    .map((item) => item.id as string);
}
