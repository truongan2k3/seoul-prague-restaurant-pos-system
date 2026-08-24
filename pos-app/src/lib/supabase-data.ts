import type {
  InventoryItem,
  KitchenStatus,
  MenuCategoryRecord,
  MenuItem,
  MenuItemAddonGroup,
  OptionGroupLibraryEntry,
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
import { applyOptionGroupLibraryToItems } from "@/lib/menu-customization";
import { normalizeOrderItemStatus } from "@/lib/order-status";
import { gridToPosition } from "@/lib/table-layout";
import { deriveItemType, resolveStation } from "@/lib/order-routing";
import { defaultTaxGroupForItemType } from "@/lib/tax-summary";
import { normalizeStaffRole, parseAllowedNav } from "@/lib/staff-roles";
import {
  fetchOptionGroupLibrary,
  mapOptionGroupLibraryResponse,
} from "@/src/lib/option-group-library-actions";
import { subscribeToPostgresChanges, subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";
import { supabase } from "@/src/lib/supabase";
import type { Station } from "@/lib/types";

/** Floor map / KDS metadata — excludes heavy `orders` JSON (use order_items instead). */
export const TABLE_SUMMARY_COLUMNS =
  "id, label, type, shape, status, payment_status, fulfillment_status, grid_column, grid_row, pos_x, pos_y, occupied_at";

export const TABLE_WITH_ORDERS_COLUMNS = `${TABLE_SUMMARY_COLUMNS}, orders`;

export const ORDER_ITEM_COLUMNS =
  "id, table_id, menu_item_id, staff_id, name, price, quantity, notes, notes_translated, is_printed_note, skip_print, hide_on_kds, station, status, kitchen_status, ready_at, is_cancelled, cancel_reason, cancelled_at, selected_addons, created_at, updated_at, modifiers";

export const MENU_ITEM_COLUMNS =
  "id, name, name_en, name_cz, name_zh, price, category, category_id, station, item_type, tax_group, sold_out, is_available, sort_order, display_order, image_url, description, description_en, description_cz, description_zh, customization_config, bill_only";

export const CATEGORY_COLUMNS = "id, name, type, display_order, created_at";

export const INVENTORY_COLUMNS = "id, name, category, quantity, unit, sold_out";

export const SALES_COLUMNS =
  "id, table_label, staff_name, subtotal, discount_amount, tip, grand_total, payment_method, amount_given, change_due, split_mode, split_count, items, activity_log, closed_at, seated_at, deleted_at, reservation_id, guest_name, guest_phone, party_size, visit_source, service_channel";

export interface SupabaseTableRow {
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
  orders?: OrderItem[] | null;
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
  tax_group?: "A" | "B" | null;
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
  bill_only?: boolean | null;
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
    taxGroup: row.tax_group ?? defaultTaxGroupForItemType(itemType),
    isAvailable,
    sortOrder: row.display_order ?? row.sort_order ?? 0,
    imageUrl: row.image_url ?? undefined,
    billOnly: row.bill_only ?? false,
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
  return fetchTableSummaries();
}

export async function fetchTableSummaries() {
  return supabase.from("tables").select(TABLE_SUMMARY_COLUMNS).order("label");
}

export async function fetchTablesWithOrders() {
  return supabase.from("tables").select(TABLE_WITH_ORDERS_COLUMNS).order("label");
}

export async function fetchMenuItems() {
  const ordered = await supabase
    .from("menu_items")
    .select(MENU_ITEM_COLUMNS)
    .order("display_order", { ascending: true })
    .order("name_en", { ascending: true });

  if (!ordered.error) return ordered;

  return supabase
    .from("menu_items")
    .select(MENU_ITEM_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("name_en", { ascending: true });
}

export async function fetchCategories() {
  const result = await supabase
    .from("categories")
    .select(CATEGORY_COLUMNS)
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

export function mapMenuItemsResponse(
  data: SupabaseMenuItemRow[] | null,
  library: OptionGroupLibraryEntry[] = [],
) {
  const items = (data ?? [])
    .map(mapMenuItemRow)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn));
  return applyOptionGroupLibraryToItems(items, library);
}

/** Fetch menu items with option-group library resolved into customizationConfig. */
export async function loadMenuItemsResolved() {
  const [menuRes, libraryRes] = await Promise.all([
    fetchMenuItems(),
    fetchOptionGroupLibrary(true),
  ]);
  if (menuRes.error) return { data: null as MenuItem[] | null, error: menuRes.error };

  const library = libraryRes.error
    ? []
    : mapOptionGroupLibraryResponse(libraryRes.data);

  return {
    data: mapMenuItemsResponse(menuRes.data, library),
    error: null,
  };
}

export async function fetchOrderItems() {
  return fetchActiveOrderItems();
}

/** Open session lines only — skips KDS-archived cancel rows. */
export async function fetchActiveOrderItems() {
  return supabase
    .from("order_items")
    .select(ORDER_ITEM_COLUMNS)
    .neq("kitchen_status", "archived")
    .order("created_at");
}

export async function fetchStationOrderItems(station: Station) {
  const kitchenStatusQuery = await supabase
    .from("order_items")
    .select(ORDER_ITEM_COLUMNS)
    .eq("station", station)
    .in("kitchen_status", ["pending", "ready", "served", "cancelled"])
    .order("created_at");

  if (!kitchenStatusQuery.error) return kitchenStatusQuery;

  return supabase
    .from("order_items")
    .select(ORDER_ITEM_COLUMNS)
    .eq("station", station)
    .in("status", ["pending", "preparing", "ready", "served"])
    .order("created_at");
}

export async function fetchStaff() {
  return supabase.from("staff").select("*").order("name");
}

export async function fetchSales(since?: Date) {
  let query = supabase.from("sales").select(SALES_COLUMNS).order("closed_at", { ascending: false });
  if (since) query = query.gte("closed_at", since.toISOString());
  return query;
}

export async function fetchInventory() {
  return supabase.from("inventory_items").select(INVENTORY_COLUMNS).order("name");
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
        username?: string | null;
        active?: boolean | null;
        allowed_nav?: unknown;
      }[]
    | null,
) {
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    username: s.username ?? undefined,
    role: normalizeStaffRole(s.role),
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
    seated_at?: string | null;
    deleted_at?: string | null;
    reservation_id?: string | null;
    guest_name?: string | null;
    guest_phone?: string | null;
    party_size?: number | null;
    visit_source?: "reservation" | "walk_in" | null;
    service_channel?: "dine_in" | "takeaway" | null;
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
      itemName?: string;
      item_name?: string;
      action: string;
      staffName?: string;
      staff_name?: string;
      meta?: Record<string, unknown> | null;
      createdAt?: string;
      created_at?: string;
    }> | null) ?? []).map((entry) => ({
      id: entry.id,
      orderId: entry.orderId ?? entry.order_id ?? "",
      itemName: entry.itemName ?? entry.item_name,
      action: entry.action,
      staffName: entry.staffName ?? entry.staff_name ?? "",
      meta: entry.meta ?? undefined,
      createdAt: new Date(entry.createdAt ?? entry.created_at ?? Date.now()),
    })),
    closedAt: new Date(s.closed_at),
    seatedAt: s.seated_at ? new Date(s.seated_at) : undefined,
    deletedAt: s.deleted_at ? new Date(s.deleted_at) : undefined,
    reservationId: s.reservation_id ?? undefined,
    guestName: s.guest_name ?? undefined,
    guestPhone: s.guest_phone ?? undefined,
    partySize: s.party_size != null ? Number(s.party_size) : undefined,
    visitSource: s.visit_source ?? undefined,
    serviceChannel: s.service_channel ?? undefined,
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

export function subscribeToTableChanges(
  onChange: () => void,
  options?: { debounceMs?: number },
) {
  return subscribeToPostgresChanges(
    "tables-realtime",
    { event: "*", schema: "public", table: "tables" },
    onChange,
    options,
  );
}

export function subscribeToOrderItemChanges(
  onChange: () => void,
  options?: { debounceMs?: number },
) {
  return subscribeToPostgresChanges(
    "order-items-realtime",
    { event: "*", schema: "public", table: "order_items" },
    onChange,
    options,
  );
}

export async function fetchStaffNameForOrderAction(orderId: string) {
  const { data } = await supabase
    .from("order_items")
    .select("staff_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!data?.staff_id) return null;

  const { data: staffRow } = await supabase
    .from("staff")
    .select("name")
    .eq("id", data.staff_id)
    .maybeSingle();

  return staffRow?.name ?? null;
}

export function subscribeToOrderItemUpdates(
  onUpdate: (payload: { new: SupabaseOrderItemRow; old: SupabaseOrderItemRow | null }) => void,
) {
  return subscribeToPostgresRowChanges(
    "order-items-ready-updates",
    { event: "UPDATE", schema: "public", table: "order_items" },
    (payload) => {
      onUpdate({
        new: payload.new as SupabaseOrderItemRow,
        old: (payload.old as SupabaseOrderItemRow | null) ?? null,
      });
    },
  );
}

export function subscribeToOrderItemInserts(
  onInsert: (row: SupabaseOrderItemRow) => void,
  channelName = "order-items-inserts",
) {
  return subscribeToPostgresRowChanges(
    channelName,
    { event: "INSERT", schema: "public", table: "order_items" },
    (payload) => {
      onInsert(payload.new as SupabaseOrderItemRow);
    },
  );
}

export function subscribeToMenuChanges(
  onChange: () => void,
  options?: { debounceMs?: number },
) {
  return subscribeToPostgresChanges(
    "menu-realtime",
    { event: "*", schema: "public", table: "menu_items" },
    onChange,
    options,
  );
}

export function subscribeToCategoryChanges(
  onChange: () => void,
  options?: { debounceMs?: number },
) {
  return subscribeToPostgresChanges(
    "categories-realtime",
    { event: "*", schema: "public", table: "categories" },
    onChange,
    options,
  );
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

export function subscribeToInventoryChanges(
  onChange: () => void,
  options?: { debounceMs?: number },
) {
  return subscribeToPostgresChanges(
    "inventory-realtime",
    { event: "*", schema: "public", table: "inventory_items" },
    onChange,
    options,
  );
}

export async function logActionToDb(staffId: string, staffName: string, action: string, details?: string) {
  return supabase.from("action_logs").insert({
    staff_id: staffId,
    staff_name: staffName,
    action,
    details,
  });
}
