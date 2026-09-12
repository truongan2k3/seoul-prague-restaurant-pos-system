import { summarizeGuestRequest } from "@/lib/table-guest-alert";
import {
  BANCHAN_OPTIONS,
  isTableQrEligible,
  type BanchanOption,
  type BanchanSelection,
  type TableGuestPaymentMethod,
  type TableGuestRequestKind,
  type TableGuestRequestPayload,
  type TableGuestRequestRecord,
} from "@/lib/table-guest";
import type { MenuOptionChoice } from "@/lib/types";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import { broadcastTableGuestRequestAlert } from "@/src/lib/table-guest-alert-server";

type TableRow = {
  id: string;
  label: string;
  status: string;
  orders?: unknown;
};

type OrderLine = {
  name?: string;
  quantity?: number;
  price?: number;
  isCancelled?: boolean;
};

export type TableGuestBillLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type TableGuestSnapshot = {
  tableId: string;
  tableLabel: string;
  status: string;
  bill: {
    lines: TableGuestBillLine[];
    total: number;
  };
  banchanOptions: BanchanOption[];
  reviewUrl: string;
  websiteUrl: string;
};

function asOrderLines(orders: unknown): OrderLine[] {
  return Array.isArray(orders) ? (orders as OrderLine[]) : [];
}


/** Live Banchan choices from Storage option group — same list POS uses when ordering Banchan. */
/** Full Banchan catalog from Storage option group (no QR enable filter). */
export async function loadAllBanchanCatalogOptions(): Promise<BanchanOption[]> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("option_group_library")
      .select("name_en, options, active")
      .ilike("name_en", "banchan")
      .eq("active", true)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) return BANCHAN_OPTIONS;

    const raw = Array.isArray(data.options) ? data.options : [];
    const mapped: BanchanOption[] = raw
      .map((option: { id?: string; nameEn?: string; nameCz?: string }, index: number) => {
        const labelEn = String(option?.nameEn ?? "").trim();
        if (!labelEn) return null;
        const id = String(option?.id ?? "").trim() || `banchan-${index}`;
        return {
          id,
          labelEn,
          labelCs: String(option?.nameCz ?? "").trim() || labelEn,
        } satisfies BanchanOption;
      })
      .filter((row): row is BanchanOption => Boolean(row));

    return mapped.length > 0 ? mapped : BANCHAN_OPTIONS;
  } catch {
    return BANCHAN_OPTIONS;
  }
}

/** null = all catalog options enabled on table QR. */
export async function loadEnabledBanchanIds(): Promise<string[] | null> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("settings")
      .select("table_qr_enabled_banchan_ids")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    const raw = (data as { table_qr_enabled_banchan_ids?: unknown }).table_qr_enabled_banchan_ids;
    if (raw == null) return null;
    if (!Array.isArray(raw)) return null;
    return raw
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  } catch {
    return null;
  }
}

/** Banchan options exposed on the guest table QR (respects POS enable toggles). */
export async function loadBanchanOptions(): Promise<BanchanOption[]> {
  const catalog = await loadAllBanchanCatalogOptions();
  const enabledIds = await loadEnabledBanchanIds();
  if (enabledIds == null) return catalog;
  const allowed = new Set(enabledIds);
  return catalog.filter((option) => allowed.has(option.id));
}

export type BanchanAdminOption = BanchanOption & { enabled: boolean };

export type BanchanAdminPayload = {
  groupId: string | null;
  options: BanchanAdminOption[];
  /** null = all enabled */
  enabledIds: string[] | null;
};

function mapCatalogOptions(raw: unknown): BanchanOption[] {
  const list = Array.isArray(raw) ? raw : [];
  const mapped: BanchanOption[] = list
    .map((option: { id?: string; nameEn?: string; nameCz?: string }, index: number) => {
      const labelEn = String(option?.nameEn ?? "").trim();
      if (!labelEn) return null;
      const id = String(option?.id ?? "").trim() || `banchan-${index}`;
      return {
        id,
        labelEn,
        labelCs: String(option?.nameCz ?? "").trim() || labelEn,
      } satisfies BanchanOption;
    })
    .filter((row): row is BanchanOption => Boolean(row));
  return mapped.length > 0 ? mapped : BANCHAN_OPTIONS;
}

function toMenuOptions(options: BanchanOption[]): MenuOptionChoice[] {
  return options.map((option, index) => ({
    id: option.id.trim() || `banchan-${index}`,
    nameEn: option.labelEn.trim(),
    nameCz: option.labelCs.trim() || option.labelEn.trim(),
    nameZh: option.labelEn.trim(),
    priceDelta: 0,
    default: option.id === "all" || option.labelEn.trim().toLowerCase() === "all",
  }));
}

/** Admin Dynamic QR — Banchan group + enable flags. */
export async function loadBanchanAdminPayload(): Promise<BanchanAdminPayload> {
  const enabledIds = await loadEnabledBanchanIds();
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("option_group_library")
      .select("id, name_en, options, active")
      .ilike("name_en", "banchan")
      .eq("active", true)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    const catalog = error || !data ? BANCHAN_OPTIONS : mapCatalogOptions(data.options);
    const options: BanchanAdminOption[] = catalog.map((option) => ({
      ...option,
      enabled: enabledIds == null ? true : enabledIds.includes(option.id),
    }));
    return {
      groupId: data && !error ? String((data as { id: string }).id) : null,
      options,
      enabledIds,
    };
  } catch {
    return {
      groupId: null,
      options: BANCHAN_OPTIONS.map((option) => ({
        ...option,
        enabled: enabledIds == null ? true : enabledIds.includes(option.id),
      })),
      enabledIds,
    };
  }
}

/** Save Banchan catalog labels + which ones appear on table QR. */
export async function saveBanchanAdminPayload(input: {
  options: BanchanOption[];
  enabledIds: string[] | null;
}): Promise<{ ok: true; groupId: string } | { ok: false; error: string }> {
  const cleaned = input.options
    .map((option, index) => ({
      id: option.id.trim() || `banchan-${Date.now().toString(36)}-${index}`,
      labelEn: option.labelEn.trim(),
      labelCs: (option.labelCs || option.labelEn).trim(),
    }))
    .filter((option) => option.labelEn.length > 0);

  if (cleaned.length === 0) {
    return { ok: false, error: "Add at least one banchan option." };
  }

  const menuOptions = toMenuOptions(cleaned);
  const admin = createSupabaseAdmin();

  const { data: existing } = await admin
    .from("option_group_library")
    .select("id, name_en, name_cz, name_zh, required, multi, display_order, active")
    .ilike("name_en", "banchan")
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  let groupId: string;
  if (existing?.id) {
    const { data, error } = await admin
      .from("option_group_library")
      .update({
        options: menuOptions,
        active: true,
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message || "Failed to update Banchan group." };
    }
    groupId = String(data.id);
  } else {
    const { data, error } = await admin
      .from("option_group_library")
      .insert({
        name_en: "Banchan",
        name_cz: "Banchan",
        name_zh: "小菜",
        required: true,
        multi: true,
        options: menuOptions,
        display_order: 0,
        active: true,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message || "Failed to create Banchan group." };
    }
    groupId = String(data.id);
  }

  const validIds = new Set(cleaned.map((option) => option.id));
  let enabledIds = input.enabledIds;
  if (enabledIds != null) {
    enabledIds = enabledIds.filter((id) => validIds.has(id));
    if (enabledIds.length === cleaned.length) enabledIds = null;
  }

  const { error: settingsError } = await admin
    .from("settings")
    .update({ table_qr_enabled_banchan_ids: enabledIds })
    .eq("id", 1);
  if (settingsError) {
    return { ok: false, error: settingsError.message || "Failed to save enable flags." };
  }

  return { ok: true, groupId };
}



function mapRequestRow(row: Record<string, unknown>): TableGuestRequestRecord {
  return {
    id: String(row.id),
    tableId: String(row.table_id),
    tableLabel: String(row.table_label ?? ""),
    kind: row.kind as TableGuestRequestKind,
    status: row.status as TableGuestRequestRecord["status"],
    payload: (row.payload as TableGuestRequestPayload) ?? {},
    note: row.note ? String(row.note) : undefined,
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    completedBy: row.completed_by ? String(row.completed_by) : undefined,
  };
}

const VALID_KINDS: TableGuestRequestKind[] = [
  "call_staff",
  "banchan",
  "grill_change",
  "payment",
];

export async function loadTableGuestSnapshot(tableId: string): Promise<TableGuestSnapshot | null> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("tables")
    .select("id, label, status, orders")
    .eq("id", tableId)
    .maybeSingle();

  if (error || !data) return null;
  const table = data as TableRow;
  if (!isTableQrEligible({ label: table.label })) return null;

  const lines: TableGuestBillLine[] = asOrderLines(table.orders)
    .filter((line) => !line.isCancelled && Number(line.quantity) > 0)
    .map((line) => {
      const quantity = Number(line.quantity) || 0;
      const unitPrice = Number(line.price) || 0;
      return {
        name: String(line.name ?? "Item"),
        quantity,
        unitPrice,
        lineTotal: quantity * unitPrice,
      };
    });

  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  const { data: settings } = await admin
    .from("settings")
    .select("cfd_review_url")
    .eq("id", 1)
    .maybeSingle();
  const reviewUrl =
    (settings as { cfd_review_url?: string | null } | null)?.cfd_review_url?.trim() ||
    "https://www.google.com/maps";

  const banchanOptions = await loadBanchanOptions();

  return {
    tableId: table.id,
    tableLabel: table.label,
    status: table.status,
    bill: { lines, total },
    banchanOptions,
    reviewUrl,
    websiteUrl: "/",
  };
}

function normalizePayload(
  kind: TableGuestRequestKind,
  payload: TableGuestRequestPayload | undefined,
  banchanOptions: BanchanOption[] = BANCHAN_OPTIONS,
): TableGuestRequestPayload {
  if (kind === "payment") {
    const method: TableGuestPaymentMethod =
      payload?.paymentMethod === "cash" ? "cash" : "card";
    return { paymentMethod: method, note: payload?.note?.trim() || undefined };
  }
  if (kind === "banchan") {
    const selected = (payload?.banchan ?? [])
      .map((item) => {
        const option = banchanOptions.find((row) => row.id === item.id);
        if (!option) return null;
        const quantity = Math.max(1, Math.min(20, Math.round(Number(item.quantity) || 1)));
        return {
          id: option.id,
          label: option.labelEn,
          quantity,
        } satisfies BanchanSelection;
      })
      .filter((item): item is BanchanSelection => Boolean(item));
    return { banchan: selected, note: payload?.note?.trim() || undefined };
  }
  return { note: payload?.note?.trim() || undefined };
}

export async function createTableGuestRequest(input: {
  tableId: string;
  kind: TableGuestRequestKind;
  payload?: TableGuestRequestPayload;
  note?: string;
}): Promise<{ data?: TableGuestRequestRecord; error?: string }> {
  const snapshot = await loadTableGuestSnapshot(input.tableId);
  if (!snapshot) return { error: "Table not found or not eligible for guest QR." };

  const kind = input.kind;
  if (!VALID_KINDS.includes(kind)) return { error: "Invalid request kind." };

  const banchanOptions = kind === "banchan" ? await loadBanchanOptions() : BANCHAN_OPTIONS;
  const payload = normalizePayload(
    kind,
    {
      ...(input.payload ?? {}),
      note: input.note ?? input.payload?.note,
    },
    banchanOptions,
  );

  if (kind === "banchan" && (!payload.banchan || payload.banchan.length === 0)) {
    return { error: "Select at least one banchan." };
  }

  const admin = createSupabaseAdmin();

  if (kind !== "banchan") {
    const since = new Date(Date.now() - 45_000).toISOString();
    const { data: recent } = await admin
      .from("table_guest_requests")
      .select("id")
      .eq("table_id", input.tableId)
      .eq("kind", kind)
      .eq("status", "pending")
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) {
      return { error: "Please wait — staff already received this request." };
    }
  }

  const { data, error } = await admin
    .from("table_guest_requests")
    .insert({
      table_id: snapshot.tableId,
      table_label: snapshot.tableLabel,
      kind,
      status: "pending",
      payload,
      note: payload.note ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to create request." };
  }

  const record = mapRequestRow(data as Record<string, unknown>);
  await broadcastTableGuestRequestAlert({
    requestId: record.id,
    tableId: record.tableId,
    tableLabel: record.tableLabel,
    kind: record.kind,
    summary: summarizeGuestRequest(record),
    createdAt: record.createdAt,
  });

  return { data: record };
}

export async function listPendingTableGuestRequests(): Promise<TableGuestRequestRecord[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("table_guest_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error || !data) return [];
  return data.map((row) => mapRequestRow(row as Record<string, unknown>));
}

export async function completeTableGuestRequest(input: {
  requestId: string;
  completedBy?: string;
}): Promise<{ data?: TableGuestRequestRecord; error?: string }> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("table_guest_requests")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: input.completedBy?.trim() || null,
    })
    .eq("id", input.requestId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Request not found or already completed." };
  return { data: mapRequestRow(data as Record<string, unknown>) };
}

export async function listQrEligibleTables(): Promise<{ id: string; label: string }[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.from("tables").select("id, label").order("label");
  if (error || !data) return [];
  return (data as { id: string; label: string }[]).filter((row) =>
    isTableQrEligible({ label: row.label }),
  );
}
