import type { MenuCategory } from "@/lib/menu-categories";

export type TableStatus = "empty" | "waiting" | "ready";
export type TableShape = "square" | "round";
export type OrderItemStatus = "pending" | "held" | "preparing" | "ready" | "served";
export type Station = "kitchen" | "bar";
export type PaymentMethod = "cash" | "card";
export type DiscountType = "percent" | "fixed";
export type SplitMode = "total" | "equal" | "items";
export type LanguageCode = "en" | "cs" | "zh";
export type ThemeMode = "light" | "dark";
export type NavId = "map" | "order" | "reservations" | "history" | "summary" | "storage" | "staff" | "settings";

export type StaffRole = "admin" | "manager" | "server" | "kitchen" | "bar";

export interface OrderItem {
  id?: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
  notesTranslated?: string;
  isPrintedNote?: boolean;
  station?: Station;
  status?: OrderItemStatus;
  menuItemId?: string;
  tableId?: string;
  createdAt?: string;
}

export interface RestaurantTable {
  id: string;
  label: string;
  type: "regular" | "special";
  shape: TableShape;
  status: TableStatus;
  gridColumn: string;
  gridRow: string;
  posX: number;
  posY: number;
  occupiedAt?: Date;
  orders?: OrderItem[];
}

export interface MenuItem {
  id: string;
  nameEn: string;
  nameCz: string;
  nameZh: string;
  descriptionEn?: string;
  descriptionCz?: string;
  descriptionZh?: string;
  category: MenuCategory | string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  station: Station;
  itemType: "food" | "drink";
  sortOrder: number;
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  pin?: string;
  active: boolean;
}

export type VisitSource = "reservation" | "walk_in";

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "no_show"
  | "checked_in"
  | "completed"
  | "late";

export interface ReservationRecord {
  id: string;
  tableId?: string;
  tableLabel?: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  partySize: number;
  reservedAt: Date;
  status: ReservationStatus;
  source: VisitSource;
  notes?: string;
  staffId?: string;
  staffName?: string;
  checkedInAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaleRecord {
  id: string;
  tableLabel: string;
  staffName: string;
  subtotal: number;
  discountAmount: number;
  tip: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  amountGiven?: number;
  changeDue?: number;
  splitMode?: SplitMode;
  splitCount?: number;
  items: OrderItem[];
  activityLog?: OrderLogEntry[];
  closedAt: Date;
  reservationId?: string;
  guestName?: string;
  guestPhone?: string;
  partySize?: number;
  visitSource?: VisitSource;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: "commercial" | "internal";
  quantity: number;
  unit: string;
  soldOut: boolean;
}

export interface ActionLogEntry {
  id: string;
  staffName: string;
  action: string;
  details?: string;
  createdAt: Date;
}

export interface OrderLogEntry {
  id: string;
  orderId: string;
  action: string;
  staffName: string;
  createdAt: Date;
}
