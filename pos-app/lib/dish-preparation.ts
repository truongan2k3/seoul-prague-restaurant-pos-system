export const DISH_SELECTION_MS = 5_000;
export const DISH_DONE_VISIBLE_MS = 10_000;

export type DishEntry = {
  id: string;
  dishKey: string;
  name: string;
  nameZh: string | null;
  tableId: string;
  tableLabel: string;
  orderedAt: string;
  quantity: number;
  note: string | null;
  completedAt?: string;
  companion?: boolean;
};

export type DishSelection = { deadline: number; saving: boolean };
export type DishCompletion = { id: string; completedAt: string };
