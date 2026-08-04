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

export type WeekdayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface DayOperatingHours {
  enabled: boolean;
  open: string;
  close: string;
}

export type ReservationOperatingHours = Record<WeekdayKey, DayOperatingHours>;

/** Thermal receipt font size preset (maps to px in receipt-print-styles). */
export type ReceiptFontSize = "normal" | "medium" | "large";

/** Thermal receipt ink density / boldness preset. */
export type ReceiptFontWeight = "normal" | "semibold" | "bold" | "extrabold";

/** Thermal receipt font family preset (system fonts for reliable printing). */
export type ReceiptFontFamily =
  | "courier"
  | "consolas"
  | "arial"
  | "tahoma"
  | "georgia"
  | "lucida";

/** Card terminal integration mode. */
export type TerminalType = "mock" | "network";

/** Menu picker tile layout on order screen. */
export type MenuItemLayout = "vertical" | "horizontal";

/** outbound = POS connects to terminal IP; inbound = POS listens, terminal connects to PC. */
export type TerminalConnectionMode = "outbound" | "inbound";

export interface AppSettings {
  printerIp: string;
  printerPort: string;
  autoPrintOnPayment: boolean;
  receiptHeaderTitle: string;
  receiptLegalName: string;
  receiptAddress: string;
  receiptCompanyAddress: string;
  receiptIco: string;
  receiptDic: string;
  receiptPhone: string;
  receiptFooterNote: string;
  customAlertSoundUrl: string;
  showPricesOnOrderScreen: boolean;
  /** Order screen menu tiles: image above text, or image + text on one row */
  menuItemLayout: MenuItemLayout;
  enablePriceRounding: boolean;
  showEurCurrency: boolean;
  eurExchangeRate: number;
  reservationTimeStep: number;
  reservationMaxGuestsPerSlot: number;
  reservationTableHoldingTime: number;
  reservationOperatingHours: ReservationOperatingHours;
  receiptFontSize: ReceiptFontSize;
  receiptFontWeight: ReceiptFontWeight;
  receiptFontFamily: ReceiptFontFamily;
  adminDeletionPassword: string;
  terminalType: TerminalType;
  terminalIp: string;
  terminalPort: string;
  terminalPosId: string;
  terminalConnectionMode: TerminalConnectionMode;
  /** Looping ad video on /client after thank-you (public URL) */
  cfdAdVideoUrl: string;
  /** Link encoded in review QR when no custom QR image is set */
  cfdReviewUrl: string;
  /** Optional uploaded QR image override */
  cfdReviewQrImageUrl: string;
}

export type StaffRole = "admin" | "manager" | "server" | "kitchen" | "bar";

export interface MenuOptionChoice {
  id: string;
  nameEn: string;
  nameCz: string;
  nameZh: string;
  /** Absolute line price when basePriceFromOptions is true */
  price?: number;
  /** Surcharge added to base menu price */
  priceDelta?: number;
  default?: boolean;
}

export interface MenuOptionGroup {
  id: string;
  nameEn: string;
  nameCz: string;
  nameZh?: string;
  required?: boolean;
  options: MenuOptionChoice[];
}

export interface MenuFreeAddOn {
  nameEn: string;
  nameCz: string;
  nameZh: string;
  onRequest?: boolean;
}

export interface MenuCustomizationConfig {
  basePriceFromOptions?: boolean;
  optionGroups?: MenuOptionGroup[];
  freeAddOn?: MenuFreeAddOn;
}

export interface SelectedMenuOption {
  groupId: string;
  optionId: string;
  nameEn: string;
  nameCz: string;
  nameZh: string;
  price?: number;
  priceDelta?: number;
}

export interface OrderLineModifiers {
  selectedOptions?: SelectedMenuOption[];
  freeAddOnSelected?: boolean;
  specialRequestIds?: string[];
}

export interface NotePreset {
  id: string;
  labelEn: string;
  labelCz: string;
  labelZh: string;
  displayOrder: number;
  active: boolean;
}

export interface OrderItem {
  id?: string;
  name: string;
  quantity: number;
  price: number;
  /** Menu list price before line-level override/discount */
  originalPrice?: number;
  notes?: string;
  notesTranslated?: string;
  isPrintedNote?: boolean;
  station?: Station;
  status?: OrderItemStatus;
  menuItemId?: string;
  tableId?: string;
  createdAt?: string;
  modifiers?: OrderLineModifiers;
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

export interface MenuCategoryRecord {
  id: string;
  name: string;
  type: "dish" | "drink";
  displayOrder: number;
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
  categoryId?: string | null;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  station: Station;
  itemType: "food" | "drink";
  sortOrder: number;
  customizationConfig?: MenuCustomizationConfig;
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
