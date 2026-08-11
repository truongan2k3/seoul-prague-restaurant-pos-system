import type {
  InventoryItem,
  KitchenStatus,
  MenuCategoryRecord,
  MenuItem,
  MenuItemAddonGroup,
  OrderItem,
  OrderLogEntry,
  RestaurantTable,
  SaleRecord,
  SelectedAddon,
  StaffMember,
  TableFulfillmentStatus,
  TablePaymentStatus,
  TableStatus,
} from "@/lib/types";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import { gridToPosition } from "@/lib/table-layout";
import { deriveItemType, resolveStation } from "@/lib/order-routing";
import { normalizeStaffRole, parseAllowedNav } from "@/lib/staff-roles";
import { supabase } from "@/src/lib/supabase";

interface SupabaseTableRow {
  id: string;
  label: string;
  type: "regular" | "special";
  shape?: "square" | "round";
  status: string;
  payment_status?: string | null;
  fulfillment_status?: string | null;
  grid_column: string;
  grid_row: string;
  pos_x?: number | null;
  pos_y?: number | null;
  occupied_at: string | null;
  orders: OrderItem[] | null;
}

interface SupabaseMenuItemRow {
  id: string;
  name?: string | null;
  name_en?: string | null;
  name_cz?: string | null;
  name_zh?: string | null;
  price: number;
  category: string;
  category_id?: string | null;
  station?: "kitchen" | "bar";
  item_type?: "food" | "drink";
  sold_out?: boolean;
  is_available?: boolean;
  sort_order?: number;
  display_order?: number;
  image_url?: string | null;
  description?: string | null;
  description_en?: string | null;
  description_cz?: string | null;
  description_zh?: string | null;
  customization_config?: import("@/lib/types").MenuCustomizationConfig | null;
}

interface SupabaseCategoryRow {
  id: string;
  name: string;
  type: "dish" | "drink";
  display_order: number;
  created_at?: string;
}

export interface SupabaseOrderItemRow {
  id: string;
  table_id: string;
  menu_item_id: string | null;
  staff_id: string | null;
  name: string;
  price: number;
  quantity: number;
  notes: string | null;
  notes_translated?: string | null;
  is_printed_note?: boolean | null;
  skip_print?: boolean | null;
  hide_on_kds?: boolean | null;
  station: "kitchen" | "bar";
  status: string;
  kitchen_status?: string | null;
  ready_at?: string | null;
  is_cancelled?: boolean | null;
  cancel_reason?: string | null;
  cancelled_at?: string | null;
  selected_addons?: SelectedAddon[] | null;
  created_at: string;
  updated_at: string;
  modifiers?: import("@/lib/types").OrderLineModifiers | null;
}

interface SupabaseMenuItemAddonRow {
  id: string;
  item_id: string;
  title: string;
  addons: SelectedAddon[] | { id?: string; name: string; price: number }[] | null;
  is_required: boolean | null;
  created_at?: string | null;
}

function normalizePaymentStatus(status: string | null | undefined): TablePaymentStatus {
  return status === "paid" ? "paid" : "unpaid";
}

function normalizeFulfillmentStatus(
  status: string | null | undefined,
): TableFulfillmentStatus {
  return status === "completed" ? "completed" : "in_progress";
}

function normalizeKitchenStatus(
  kitchenStatus: string | null | undefined,
  legacyStatus: string,
  isCancelled?: boolean | null,
): KitchenStatus {
  if (isCancelled || kitchenStatus === "cancelled") return "cancelled";
  if (kitchenStatus === "archived") return "archived";
  if (kitchenStatus === "pending" || kitchenStatus === "ready" || kitchenStatus === "served") {
    return kitchenStatus;
  }
  const normalized = normalizeOrderItemStatus(legacyStatus);
  if (normalized === "ready") return "ready";
  if (normalized === "served") return "served";
  return "pending";
}

function normalizeStatus(status: string): TableStatus {
  if (status === "occupied") return "waiting";
  if (status === "empty" || status === "waiting" || status === "ready") return status;
  return "empty";
}

export function mapTableRow(row: SupabaseTableRow): RestaurantTable {
  const fallback = gridToPosition(row.grid_column, row.grid_row);
  return {
    id: row.id,
    label: row.label,
    type: row.type,
    shape: row.shape ?? "square",
    status: normalizeStatus(row.status),
    paymentStatus: normalizePaymentStatus(row.payment_status),
    fulfillmentStatus: normalizeFulfillmentStatus(row.fulfillment_status),
    gridColumn: row.grid_column,
    gridRow: row.grid_row,
    posX: row.pos_x ?? fallback.x,
    posY: row.pos_y ?? fallback.y,
    occupiedAt: row.occupied_at ? new Date(row.occupied_at) : undefined,
    orders: row.orders ?? undefined,
  };
}

export function mapMenuItemRow(row: SupabaseMenuItemRow): MenuItem {
  const itemType = row.item_type ?? deriveItemType(row.category);
  const isAvailable = row.is_available ?? !(row.sold_out ?? false);
  return {
    id: row.id,
    nameEn: row.name_en?.trim() || row.name?.trim() || "",
    nameCz: row.name_cz?.trim() || "",
    nameZh: row.name_zh?.trim() || "",
    descriptionEn: row.description_en?.trim() || row.description?.trim() || undefined,
    descriptionCz: row.description_cz?.trim() || undefined,
    descriptionZh: row.description_zh?.trim() || undefined,
    category: row.category,
    categoryId: row.category_id ?? undefined,
    price: Number(row.price),
    station: row.station ?? resolveStation(row.category, itemType),
    itemType,
    isAvailable,
    sortOrder: row.display_order ?? row.sort_order ?? 0,
    imageUrl: row.image_url ?? undefined,
    customizationConfig: row.customization_config ?? undefined,
  };
}

export function mapCategoryRow(row: SupabaseCategoryRow): MenuCategoryRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    displayOrder: row.display_order ?? 0,
  };
}

export function mapOrderItemRow(row: SupabaseOrderItemRow): OrderItem {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    quantity: row.quantity,
    notes: row.notes ?? undefined,
    notesTranslated: row.notes_translated ?? undefined,
    isPrintedNote: row.is_printed_note ?? undefined,
    skipPrint: row.skip_print ?? undefined,
    hideOnKds: row.hide_on_kds ?? undefined,
    station: row.station,
    status: normalizeOrderItemStatus(row.status),
    kitchenStatus: normalizeKitchenStatus(row.kitchen_status, row.status, row.is_cancelled),
    isCancelled: Boolean(row.is_cancelled) || row.kitchen_status === "cancelled",
    cancelReason: row.cancel_reason ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    readyAt: row.ready_at ?? undefined,
    selectedAddons: row.selected_addons ?? undefined,
    menuItemId: row.menu_item_id ?? undefined,
    tableId: row.table_id,
    createdAt: row.created_at,
    modifiers: row.modifiers ?? undefined,
  };
}

export function mapMenuItemAddonRow(row: SupabaseMenuItemAddonRow): MenuItemAddonGroup {
  const addons = Array.isArray(row.addons)
    ? row.addons.map((addon, index) => ({
        id: typeof addon.id === "string" && addon.id ? addon.id : `addon-${index}`,
        name: addon.name,
        price: Number(addon.price) || 0,
      }))
    : [];

  return {
    id: row.id,
    itemId: row.item_id,
    title: row.title,
    addons,
    isRequired: Boolean(row.is_required),
    createdAt: row.created_at ?? undefined,
  };
}

export async function fetchTables() {
  return supabase.from("tables").select("*").order("label");
}

export async function fetchMenuItems() {
  const ordered = await supabase
    .from("menu_items")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (!ordered.error) return ordered;

  return supabase
    .from("menu_items")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });
}

export async function fetchCategories() {
  const result = await supabase
    .from("categories")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (
    result.error &&
    (result.error.code === "42P01" || result.error.message.toLowerCase().includes("categories"))
  ) {
    return { data: [], error: null };
  }

  return result;
}

export async function fetchMenuItemAddons(itemId?: string) {
  let query = supabase
    .from("menu_item_addons")
    .select("*")
    .order("created_at", { ascending: true });

  if (itemId) query = query.eq("item_id", itemId);

  return query;
}

export function mapCategoriesResponse(data: SupabaseCategoryRow[] | null) {
  return (data ?? [])
    .map(mapCategoryRow)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
}

export function mapMenuItemsResponse(data: SupabaseMenuItemRow[] | null) {
  return (data ?? [])
    .map(mapMenuItemRow)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn));
}

export async function fetchOrderItems() {
  return supabase
    .from("order_items")
    .select("*")
    .not("status", "eq", "served")
    .order("created_at");
}

export async function fetchStaff() {
  return supabase.from("staff").select("*").order("name");
}

export async function fetchSales(since?: Date) {
  let query = supabase.from("sales").select("*").order("closed_at", { ascending: false });
  if (since) query = query.gte("closed_at", since.toISOString());
  return query;
}

export async function fetchInventory() {
  return supabase.from("inventory_items").select("*").order("name");
}

export function mapTablesResponse(data: SupabaseTableRow[] | null) {
  return (data ?? []).map(mapTableRow);
}

export function mapStaffResponse(
  data:
    | {
        id: string;
        name: string;
        role: string;
        pin?: string | null;
        active?: boolean | null;
        allowed_nav?: unknown;
      }[]
    | null,
) {
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    role: normalizeStaffRole(s.role),
    pin: s.pin ?? undefined,
    active: s.active ?? true,
    allowedNav: parseAllowedNav(s.allowed_nav),
  }));
}

export function mapSalesResponse(
  data: {
    id: string;
    table_label: string | null;
    staff_name: string | null;
    subtotal: number;
    discount_amount?: number | null;
    tip: number;
    grand_total?: number | null;
    payment_method: "cash" | "card";
    amount_given?: number | null;
    change_due?: number | null;
    split_mode?: "total" | "equal" | "items" | null;
    split_count?: number | null;
    items: OrderItem[];
    activity_log?: OrderLogEntry[] | null;
    closed_at: string;
    reservation_id?: string | null;
    guest_name?: string | null;
    guest_phone?: string | null;
    party_size?: number | null;
    visit_source?: "reservation" | "walk_in" | null;
  }[] | null,
): SaleRecord[] {
  return (data ?? []).map((s) => ({
    id: s.id,
    tableLabel: s.table_label ?? "",
    staffName: s.staff_name ?? "",
    subtotal: Number(s.subtotal),
    discountAmount: Number(s.discount_amount ?? 0),
    tip: Number(s.tip),
    grandTotal: Number(s.grand_total ?? s.subtotal + Number(s.tip) - Number(s.discount_amount ?? 0)),
    paymentMethod: s.payment_method,
    amountGiven: s.amount_given != null ? Number(s.amount_given) : undefined,
    changeDue: s.change_due != null ? Number(s.change_due) : undefined,
    splitMode: s.split_mode ?? undefined,
    splitCount: s.split_count ?? undefined,
    items: s.items,
    activityLog: ((s.activity_log as Array<{
      id: string;
      orderId?: string;
      order_id?: string;
      action: string;
      staffName?: string;
      staff_name?: string;
      createdAt?: string;
      created_at?: string;
    }> | null) ?? []).map((entry) => ({
      id: entry.id,
      orderId: entry.orderId ?? entry.order_id ?? "",
      action: entry.action,
      staffName: entry.staffName ?? entry.staff_name ?? "",
      createdAt: new Date(entry.createdAt ?? entry.created_at ?? Date.now()),
    })),
    closedAt: new Date(s.closed_at),
    reservationId: s.reservation_id ?? undefined,
    guestName: s.guest_name ?? undefined,
    guestPhone: s.guest_phone ?? undefined,
    partySize: s.party_size != null ? Number(s.party_size) : undefined,
    visitSource: s.visit_source ?? undefined,
  }));
}

export function mapInventoryResponse(
  data: {
    id: string;
    name: string;
    category: "commercial" | "internal";
    quantity: number;
    unit: string;
    sold_out: boolean;
  }[] | null,
): InventoryItem[] {
  return (data ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    quantity: Number(i.quantity),
    unit: i.unit,
    soldOut: i.sold_out,
  }));
}

export function subscribeToTableChanges(onChange: () => void) {
  const channel = supabase
    .channel("tables-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "tables" }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToOrderItemChanges(onChange: () => void) {
  const channel = supabase
    .channel("order-items-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function fetchStaffNameForOrderAction(orderId: string, action: string) {
  const { data } = await supabase
    .from("order_logs")
    .select("staff_name")
    .eq("order_id", orderId)
    .eq("action", action)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.staff_name ?? null;
}

export function subscribeToOrderItemUpdates(
  onUpdate: (payload: { new: SupabaseOrderItemRow; old: SupabaseOrderItemRow | null }) => void,
) {
  const channel = supabase
    .channel("order-items-ready-updates")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "order_items" },
      (payload) => {
        onUpdate({
          new: payload.new as SupabaseOrderItemRow,
          old: (payload.old as SupabaseOrderItemRow | null) ?? null,
        });
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToOrderItemInserts(
  onInsert: (row: SupabaseOrderItemRow) => void,
  channelName = "order-items-inserts",
) {
  const channel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "order_items" },
      (payload) => {
        onInsert(payload.new as SupabaseOrderItemRow);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToMenuChanges(onChange: () => void) {
  const channel = supabase
    .channel("menu-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToCategoryChanges(onChange: () => void) {
  const channel = supabase
    .channel(`categories-realtime-${Date.now()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function updateTableLayout(
  tableId: string,
  gridColumn: string,
  gridRow: string,
) {
  return supabase
    .from("tables")
    .update({ grid_column: gridColumn, grid_row: gridRow })
    .eq("id", tableId);
}

export async function updateTablePosition(tableId: string, posX: number, posY: number) {
  return supabase
    .from("tables")
    .update({
      pos_x: Math.round(posX),
      pos_y: Math.round(posY),
    })
    .eq("id", tableId);
}

export async function updateTableMetadata(
  tableId: string,
  updates: {
    label?: string;
    type?: "regular" | "special";
    shape?: "square" | "round";
  },
) {
  const payload: Record<string, string> = {};
  if (updates.label !== undefined) payload.label = updates.label.trim();
  if (updates.type !== undefined) payload.type = updates.type;
  if (updates.shape !== undefined) payload.shape = updates.shape;
  if (Object.keys(payload).length === 0) {
    return { data: null, error: null };
  }
  return supabase.from("tables").update(payload).eq("id", tableId);
}

export function subscribeToInventoryChanges(onChange: () => void) {
  const channel = supabase
    .channel("inventory-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items" }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function logActionToDb(staffId: string, staffName: string, action: string, details?: string) {
  return supabase.from("action_logs").insert({
    staff_id: staffId,
    staff_name: staffName,
    action,
    details,
  });
}
