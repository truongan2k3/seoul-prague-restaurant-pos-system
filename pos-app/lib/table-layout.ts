/** Convert legacy grid placement to pixel coordinates for the free-layout map. */
export function gridToPosition(gridColumn: string, gridRow: string) {
  const col = Number.parseInt(gridColumn.split("/")[0]?.trim() ?? "1", 10) || 1;
  const row = Number.parseInt(gridRow.split("/")[0]?.trim() ?? "1", 10) || 1;
  const cellWidth = 148;
  const cellHeight = 136;
  const gap = 16;
  const padding = 24;

  return {
    x: padding + (col - 1) * (cellWidth + gap),
    y: padding + (row - 1) * (cellHeight + gap),
  };
}

export const TABLE_CARD_WIDTH = 140;
