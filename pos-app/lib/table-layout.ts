/** Visual size of a floor-plan table card (matches `table-card` max height). */
export const TABLE_CARD_WIDTH = 140;
export const TABLE_CARD_HEIGHT = 176;
/** Gap between cards when converting grid → pixels / anti-overlap. */
export const TABLE_CARD_GAP = 16;

/** Convert legacy grid placement to pixel coordinates for the free-layout map. */
export function gridToPosition(gridColumn: string, gridRow: string) {
  const col = Number.parseInt(gridColumn.split("/")[0]?.trim() ?? "1", 10) || 1;
  const row = Number.parseInt(gridRow.split("/")[0]?.trim() ?? "1", 10) || 1;
  const cellWidth = TABLE_CARD_WIDTH + 8;
  const cellHeight = TABLE_CARD_HEIGHT;
  const gap = TABLE_CARD_GAP;
  const padding = 24;

  return {
    x: padding + (col - 1) * (cellWidth + gap),
    y: padding + (row - 1) * (cellHeight + gap),
  };
}

type Point = { x: number; y: number };

function rectsOverlap(
  a: Point,
  b: Point,
  width: number,
  height: number,
  gap: number,
): boolean {
  return !(
    a.x + width + gap <= b.x ||
    b.x + width + gap <= a.x ||
    a.y + height + gap <= b.y ||
    b.y + height + gap <= a.y
  );
}

/**
 * Push overlapping free-layout cards apart so titles/badges don't crush each other.
 * Stable: sort by y then x, nudge downward only.
 */
export function resolveFloorCardOverlaps(
  entries: Array<{ id: string; x: number; y: number }>,
  width = TABLE_CARD_WIDTH,
  height = TABLE_CARD_HEIGHT,
  gap = TABLE_CARD_GAP,
): Record<string, Point> {
  const sorted = entries
    .map((entry) => ({ ...entry }))
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i]!;
    let changed = true;
    let guard = 0;
    while (changed && guard < sorted.length + 2) {
      changed = false;
      guard += 1;
      for (let j = 0; j < i; j += 1) {
        const other = sorted[j]!;
        if (!rectsOverlap(current, other, width, height, gap)) continue;
        const nextY = other.y + height + gap;
        if (nextY > current.y) {
          current.y = nextY;
          changed = true;
        }
      }
    }
  }

  return Object.fromEntries(sorted.map((entry) => [entry.id, { x: entry.x, y: entry.y }]));
}
