import * as XLSX from "xlsx";
import {
  isGrillCategory,
  isGrillGuestPrepOrder,
} from "@/lib/grill-guest-count";
import { parseReservationBbqNotes } from "@/lib/reservation-guest-form";
import type { DateRange } from "@/lib/summary-analytics";
import type {
  LanguageCode,
  MenuItem,
  OrderItem,
  ReservationRecord,
  ReservationStatus,
  SaleRecord,
} from "@/lib/types";
import { formatSummaryDate } from "@/lib/summary-analytics";

export type GuestBbqOrderStatus = "ate_bbq" | "no_bbq" | "no_order";

export type GuestBbqFilter = "all" | "ate_bbq" | "no_bbq" | "no_order";

export type GuestListSortKey =
  | "reservedAtDesc"
  | "reservedAtAsc"
  | "nameAsc"
  | "partySizeDesc"
  | "partySizeAsc"
  | "statusAsc";

export interface GuestListRow {
  reservationId: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  reservedAt: Date;
  partySize: number;
  tableLabel: string;
  status: ReservationStatus;
  source: string;
  bookingCode: string;
  eventType: string;
  notes: string;
  /** Preference from reservation form notes (display only). */
  bbqPreference: "yes" | "no" | "undecided" | "";
  /** Derived from linked sale order items + menu categories. */
  bbqOrderStatus: GuestBbqOrderStatus;
  saleId: string;
  saleTotal: number | null;
  salePaymentMethod: string;
  saleItemCount: number;
  grillItemNames: string;
  orderSummary: string;
}

export interface GuestListFilters {
  bbq: GuestBbqFilter;
  status: ReservationStatus | "all";
  partySizeMin: number | null;
  partySizeMax: number | null;
  search: string;
  sort: GuestListSortKey;
}

export const DEFAULT_GUEST_LIST_FILTERS: GuestListFilters = {
  bbq: "all",
  status: "all",
  partySizeMin: null,
  partySizeMax: null,
  search: "",
  sort: "reservedAtDesc",
};

function orderIsGrillItem(order: OrderItem, menuItems: MenuItem[]): boolean {
  if (order.isCancelled) return false;
  if (isGrillGuestPrepOrder(order)) return false;
  const menu = order.menuItemId
    ? menuItems.find((item) => item.id === order.menuItemId)
    : undefined;
  if (menu) return isGrillCategory(menu.category);
  // Fallback: name heuristics when menu link is missing on historical sales.
  const name = order.name.toLowerCase();
  return (
    name.includes("grill") ||
    name.includes("bbq") ||
    name.includes("gril") ||
    name.includes("nướng")
  );
}

function saleHasGrillItems(sale: SaleRecord, menuItems: MenuItem[]): boolean {
  return sale.items.some((item) => orderIsGrillItem(item, menuItems));
}

function grillNamesForSale(sale: SaleRecord, menuItems: MenuItem[]): string[] {
  return sale.items
    .filter((item) => orderIsGrillItem(item, menuItems))
    .map((item) => `${item.name}×${item.quantity}`);
}

function orderSummaryForSale(sale: SaleRecord): string {
  return sale.items
    .filter((item) => !item.isCancelled)
    .slice(0, 8)
    .map((item) => `${item.name}×${item.quantity}`)
    .join("; ");
}

function sameVenueDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function findLinkedSale(
  reservation: ReservationRecord,
  sales: SaleRecord[],
): SaleRecord | null {
  const byId = sales.find(
    (sale) => !sale.deletedAt && sale.reservationId === reservation.id,
  );
  if (byId) return byId;

  const phone = (reservation.guestPhone ?? "").replace(/\D/g, "");
  const phoneTail = phone.length >= 6 ? phone.slice(-6) : phone;
  const name = reservation.guestName.trim().toLowerCase();

  const candidates = sales.filter((sale) => {
    if (sale.deletedAt) return false;
    if (!sameVenueDay(sale.closedAt, reservation.reservedAt)) return false;
    if (reservation.tableLabel && sale.tableLabel === reservation.tableLabel) {
      return true;
    }
    if (phoneTail) {
      const salePhone = (sale.guestPhone ?? "").replace(/\D/g, "");
      if (salePhone.endsWith(phoneTail) || phoneTail.endsWith(salePhone.slice(-6))) {
        return true;
      }
    }
    if (name && (sale.guestName ?? "").trim().toLowerCase() === name) return true;
    return false;
  });

  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => Math.abs(a.closedAt.getTime() - reservation.reservedAt.getTime()) -
      Math.abs(b.closedAt.getTime() - reservation.reservedAt.getTime()),
  );
  return candidates[0] ?? null;
}

export function buildGuestListRows(
  reservations: ReservationRecord[],
  sales: SaleRecord[],
  menuItems: MenuItem[],
): GuestListRow[] {
  return reservations.map((reservation) => {
    const { bbq, noteText } = parseReservationBbqNotes(reservation.notes);
    const sale = findLinkedSale(reservation, sales);
    const ateBbq = sale ? saleHasGrillItems(sale, menuItems) : false;
    const grillItemNames = sale ? grillNamesForSale(sale, menuItems) : [];
    const bbqOrderStatus: GuestBbqOrderStatus = !sale
      ? "no_order"
      : ateBbq
        ? "ate_bbq"
        : "no_bbq";

    return {
      reservationId: reservation.id,
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail ?? "",
      guestPhone: reservation.guestPhone ?? "",
      reservedAt: reservation.reservedAt,
      partySize: reservation.partySize,
      tableLabel: reservation.tableLabel ?? "",
      status: reservation.status,
      source: reservation.source,
      bookingCode: reservation.bookingCode ?? "",
      eventType: reservation.eventType ?? "",
      notes: noteText,
      bbqPreference: bbq ?? "",
      bbqOrderStatus,
      saleId: sale?.id ?? "",
      saleTotal: sale ? sale.grandTotal : null,
      salePaymentMethod: sale?.paymentMethod ?? "",
      saleItemCount: sale ? sale.items.filter((item) => !item.isCancelled).length : 0,
      grillItemNames: grillItemNames.join("; "),
      orderSummary: sale ? orderSummaryForSale(sale) : "",
    };
  });
}

export function filterGuestListRows(
  rows: GuestListRow[],
  filters: GuestListFilters,
  range?: DateRange | null,
): GuestListRow[] {
  const search = filters.search.trim().toLowerCase();
  let next = rows.filter((row) => {
    if (range) {
      const t = row.reservedAt.getTime();
      if (t < range.start.getTime() || t > range.end.getTime()) return false;
    }
    if (filters.bbq !== "all" && row.bbqOrderStatus !== filters.bbq) return false;
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.partySizeMin != null && row.partySize < filters.partySizeMin) return false;
    if (filters.partySizeMax != null && row.partySize > filters.partySizeMax) return false;
    if (search) {
      const hay = [
        row.guestName,
        row.guestEmail,
        row.guestPhone,
        row.tableLabel,
        row.bookingCode,
        row.notes,
        row.orderSummary,
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  next = [...next].sort((a, b) => {
    switch (filters.sort) {
      case "reservedAtAsc":
        return a.reservedAt.getTime() - b.reservedAt.getTime();
      case "nameAsc":
        return a.guestName.localeCompare(b.guestName);
      case "partySizeDesc":
        return b.partySize - a.partySize;
      case "partySizeAsc":
        return a.partySize - b.partySize;
      case "statusAsc":
        return a.status.localeCompare(b.status);
      case "reservedAtDesc":
      default:
        return b.reservedAt.getTime() - a.reservedAt.getTime();
    }
  });

  return next;
}

export type GuestListExportLabels = {
  sheetName: string;
  guestName: string;
  email: string;
  phone: string;
  reservedAt: string;
  partySize: string;
  table: string;
  status: string;
  source: string;
  bookingCode: string;
  eventType: string;
  notes: string;
  bbqPreference: string;
  bbqOrder: string;
  saleTotal: string;
  paymentMethod: string;
  grillItems: string;
  orderSummary: string;
  period: string;
  ateBbq: string;
  noBbq: string;
  noOrder: string;
};

function bbqOrderLabel(status: GuestBbqOrderStatus, labels: GuestListExportLabels): string {
  if (status === "ate_bbq") return labels.ateBbq;
  if (status === "no_bbq") return labels.noBbq;
  return labels.noOrder;
}

function formatReservedAt(value: Date, language: LanguageCode): string {
  try {
    return new Intl.DateTimeFormat(
      language === "cs" ? "cs-CZ" : language === "zh" ? "zh-CN" : "en-GB",
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      },
    ).format(value);
  } catch {
    return value.toISOString();
  }
}

export function downloadGuestListExcel(
  rows: GuestListRow[],
  range: DateRange,
  language: LanguageCode,
  labels: GuestListExportLabels,
): void {
  const periodLabel = `${formatSummaryDate(range.start, language)} – ${formatSummaryDate(range.end, language)}`;
  const header = [
    labels.guestName,
    labels.email,
    labels.phone,
    labels.reservedAt,
    labels.partySize,
    labels.table,
    labels.status,
    labels.source,
    labels.bookingCode,
    labels.eventType,
    labels.notes,
    labels.bbqPreference,
    labels.bbqOrder,
    labels.saleTotal,
    labels.paymentMethod,
    labels.grillItems,
    labels.orderSummary,
  ];

  const dataRows = rows.map((row) => [
    row.guestName,
    row.guestEmail,
    row.guestPhone,
    formatReservedAt(row.reservedAt, language),
    row.partySize,
    row.tableLabel,
    row.status,
    row.source,
    row.bookingCode,
    row.eventType,
    row.notes,
    row.bbqPreference,
    bbqOrderLabel(row.bbqOrderStatus, labels),
    row.saleTotal == null ? "" : Math.round(row.saleTotal * 100) / 100,
    row.salePaymentMethod,
    row.grillItemNames,
    row.orderSummary,
  ]);

  const aoa: unknown[][] = [[labels.period, periodLabel], [], header, ...dataRows];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [
    { wch: 22 },
    { wch: 28 },
    { wch: 16 },
    { wch: 18 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 28 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 28 },
    { wch: 40 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, labels.sheetName.slice(0, 31));
  const stamp = formatSummaryDate(range.start, "en").replace(/\s+/g, "-");
  XLSX.writeFile(workbook, `guest-list-${stamp}.xlsx`);
}

export function downloadGuestListCsv(
  rows: GuestListRow[],
  range: DateRange,
  language: LanguageCode,
  labels: GuestListExportLabels,
): void {
  const header = [
    labels.guestName,
    labels.email,
    labels.phone,
    labels.reservedAt,
    labels.partySize,
    labels.table,
    labels.status,
    labels.source,
    labels.bookingCode,
    labels.eventType,
    labels.notes,
    labels.bbqPreference,
    labels.bbqOrder,
    labels.saleTotal,
    labels.paymentMethod,
    labels.grillItems,
    labels.orderSummary,
  ];

  const escape = (value: string | number) => {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const lines = [
    header.map(escape).join(","),
    ...rows.map((row) =>
      [
        row.guestName,
        row.guestEmail,
        row.guestPhone,
        formatReservedAt(row.reservedAt, language),
        row.partySize,
        row.tableLabel,
        row.status,
        row.source,
        row.bookingCode,
        row.eventType,
        row.notes,
        row.bbqPreference,
        bbqOrderLabel(row.bbqOrderStatus, labels),
        row.saleTotal == null ? "" : Math.round(row.saleTotal * 100) / 100,
        row.salePaymentMethod,
        row.grillItemNames,
        row.orderSummary,
      ]
        .map(escape)
        .join(","),
    ),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = formatSummaryDate(range.start, "en").replace(/\s+/g, "-");
  a.href = url;
  a.download = `guest-list-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
