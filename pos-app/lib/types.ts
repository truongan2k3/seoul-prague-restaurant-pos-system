import type { MenuCategory } from "@/lib/menu-categories";

export type TableStatus = "empty" | "waiting" | "ready";
export type TableShape = "square" | "round";
export type OrderItemStatus = "pending" | "held" | "preparing" | "ready" | "served";
/** Coarse KDS lane status for auto-serve / cancel / acknowledge. */
export type KitchenStatus = "pending" | "ready" | "served" | "cancelled" | "archived";
export type TablePaymentStatus = "unpaid" | "paid";
export type TableFulfillmentStatus = "in_progress" | "completed";
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

/** Menu picker tile layout on order screen. */
export type MenuItemLayout = "vertical" | "horizontal";

/** Roles a network thermal printer can serve. */
export type PrinterRole = "receipt" | "kitchen";

/** LAN thermal printer targeted via the local print bridge. */
export interface NetworkPrinter {
  id: string;
  name: string;
  host: string;
  port: string;
  enabled: boolean;
  roles: PrinterRole[];
}

/** Configurable alert sounds (paths under /public/sounds). */
export interface SoundConfigs {
  callWaiter: string;
  newOrder: string;
  paymentSuccess: string;
}

/** Languages printed on kitchen tickets (large primary + optional secondary). */
export type KitchenPrintLanguage = "zh" | "en" | "cs";

/** Bitmap text size for kitchen order / message tickets (Large = minimum). */
export type KitchenPrintFontSize = "large" | "xlarge" | "xxlarge";

export interface AppSettings {
  printerIp: string;
  printerPort: string;
  /** Use local print bridge for silent multi-printer ESC/POS (no browser dialog). */
  silentPrintEnabled: boolean;
  /** Local bridge base URL, e.g. http://127.0.0.1:39100 */
  printBridgeUrl: string;
  /** If silent print fails, fall back to browser print dialog. */
  browserPrintFallback: boolean;
  /** Configured LAN printers (receipt / kitchen roles). */
  printers: NetworkPrinter[];
  autoPrintOnPayment: boolean;
  /** Print kitchen ticket when staff sends order. */
  kitchenPrintEnabled: boolean;
  /**
   * When true, phones/tablets do not print; keep `/print-station` open on the
   * Windows PC so it prints via the local bridge (127.0.0.1).
   */
  kitchenPrintViaStation: boolean;
  /** Large text language on kitchen ticket. */
  kitchenPrintPrimaryLang: KitchenPrintLanguage;
  /** Smaller text under primary (optional secondary). */
  kitchenPrintSecondaryLang: KitchenPrintLanguage | "none";
  /** Item-name size on kitchen order tickets. */
  kitchenPrintOrderFontSize: KitchenPrintFontSize;
  /** Message body size on kitchen staff-message tickets. */
  kitchenPrintMessageFontSize: KitchenPrintFontSize;
  receiptHeaderTitle: string;
  receiptLegalName: string;
  receiptAddress: string;
  receiptCompanyAddress: string;
  receiptIco: string;
  receiptDic: string;
  receiptPhone: string;
  receiptFooterNote: string;
  customAlertSoundUrl: string;
  soundConfigs: SoundConfigs;
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
  /** Looping ad video on /client after thank-you (public URL) */
  cfdAdVideoUrl: string;
  /** Link encoded in review QR when no custom QR image is set */
  cfdReviewUrl: string;
  /** Optional uploaded QR image override */
  cfdReviewQrImageUrl: string;
  /** Scrolling announcement banner on main POS tabs */
  marqueeEnabled: boolean;
  marqueeText: string;
  /** Seconds for one full scroll loop (lower = faster) */
  marqueeDurationSeconds: number;
  marqueeFontFamily: ReceiptFontFamily;
  /** ISO datetime — hide marquee after this moment (empty = no expiry) */
  marqueeEndAt: string;
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

/** Priced add-on chosen on an order line (stored in order_items.selected_addons). */
export interface SelectedAddon {
  id?: string;
  name: string;
  price: number;
}

/** One add-on choice inside a menu_item_addons group. */
export interface MenuAddonChoice {
  id: string;
  name: string;
  price: number;
}

/** Special-request / add-on group linked to a menu item. */
export interface MenuItemAddonGroup {
  id: string;
  itemId: string;
  title: string;
  addons: MenuAddonChoice[];
  isRequired: boolean;
  createdAt?: string;
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
  /** Menu list price before line-level override/discount */
  originalPrice?: number;
  price: number;
  notes?: string;
  notesTranslated?: string;
  isPrintedNote?: boolean;
  station?: Station;
  status?: OrderItemStatus;
  kitchenStatus?: KitchenStatus;
  /** Soft-deleted / kitchen cancel alert */
  isCancelled?: boolean;
  cancelReason?: string;
  cancelledAt?: string;
  /** ISO timestamp when kitchen marked the line ready (starts 3-min auto-serve). */
  readyAt?: string;
  selectedAddons?: SelectedAddon[];
  menuItemId?: string;
  tableId?: string;
  createdAt?: string;
  modifiers?: OrderLineModifiers;
  /** When display-aggregated, all underlying DB row ids. */
  unitIds?: string[];
}

export interface RestaurantTable {
  id: string;
  label: string;
  type: "regular" | "special";
  shape: TableShape;
  status: TableStatus;
  paymentStatus?: TablePaymentStatus;
  fulfillmentStatus?: TableFulfillmentStatus;
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
