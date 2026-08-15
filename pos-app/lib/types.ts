import type { MenuCategory } from "@/lib/menu-categories";
import type { KitchenPrintLayout } from "@/lib/kitchen-print-layout";
import type { KitchenFulfillmentMode } from "@/lib/kitchen-fulfillment-mode";
import type { TaxGroup } from "@/lib/receipt-config";
import type { ServiceChannel } from "@/lib/tax-summary";

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

export type MenuSortMode = "custom" | "alphabetical";

export type MarqueeSurface = "pos" | "client" | "kds" | "bar";

export interface MarqueeSurfaceConfig {
  enabled: boolean;
  /** Non-empty strings scroll one after another (not simultaneous). */
  messages: string[];
  durationSeconds: number;
  fontFamily: ReceiptFontFamily;
  /** ISO datetime — hide after this moment (empty = no expiry) */
  endAt: string;
}

export type MarqueeConfigs = Record<MarqueeSurface, MarqueeSurfaceConfig>;

export type CfdSlideshowMediaType = "image" | "video" | "gif";

export interface CfdSlideshowItem {
  id: string;
  url: string;
  type: CfdSlideshowMediaType;
  /** Still images default to 12s when omitted */
  durationSeconds?: number;
}

/** Roles a network thermal printer can serve. */
export type PrinterRole = "receipt" | "kitchen" | "kitchen-message" | "bar";

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

export type {
  KitchenPrintLayout,
  KitchenPrintLayoutAlign,
  KitchenPrintLayoutElement,
  KitchenPrintLayoutSizeScale,
  KitchenPrintMessageTicketLayout,
  KitchenPrintOrderTicketLayout,
} from "@/lib/kitchen-print-layout";

export interface AppSettings {
  printerIp: string;
  printerPort: string;
  /** Use local print bridge for silent multi-printer ESC/POS (no browser dialog). */
  silentPrintEnabled: boolean;
  /** Local bridge base URL, e.g. http://127.0.0.1:39100 */
  printBridgeUrl: string;
  /** If silent print fails, fall back to browser print dialog. */
  browserPrintFallback: boolean;
  /** Configured LAN printers (receipt / kitchen / kitchen-message / bar roles). */
  printers: NetworkPrinter[];
  autoPrintOnPayment: boolean;
  /** Print kitchen ticket when staff sends order. */
  kitchenPrintEnabled: boolean;
  /**
   * Kitchen output mode: KDS/bar screen, paper tickets only, or both.
   * Paper-only skips KDS/bar and marks sent items done immediately.
   */
  kitchenFulfillmentMode: KitchenFulfillmentMode;
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
  /** Ink density / boldness for kitchen order ticket bitmap text. */
  kitchenPrintOrderFontWeight: ReceiptFontWeight;
  /** Ink density / boldness for kitchen message ticket bitmap text. */
  kitchenPrintMessageFontWeight: ReceiptFontWeight;
  /** Per-element layout for kitchen order and message tickets (JSON). */
  kitchenPrintLayout: KitchenPrintLayout;
  /** Blank margin at top of kitchen tickets (mm) — avoids clip rail covering table. */
  kitchenPrintClipTopMm: number;
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
  /** Looping ad video on /client after thank-you (public URL) — legacy single file */
  cfdAdVideoUrl: string;
  /** Ordered idle slideshow on customer display (videos, GIFs, images) */
  cfdAdSlideshow: CfdSlideshowItem[];
  /** Category tabs on order screen: custom drag order or A–Z */
  menuCategorySortMode: MenuSortMode;
  /** Menu items within a category: custom drag order or A–Z */
  menuItemSortMode: MenuSortMode;
  /** Link encoded in review QR when no custom QR image is set */
  cfdReviewUrl: string;
  /** Optional uploaded QR image override */
  cfdReviewQrImageUrl: string;
  /** Scrolling announcement banner — per-screen configs */
  marqueeConfigs: MarqueeConfigs;
  /** @deprecated Use marqueeConfigs — kept for legacy DB migration */
  marqueeEnabled: boolean;
  marqueeText: string;
  /** Seconds for one full scroll across the screen (lower = faster) */
  marqueeDurationSeconds: number;
  marqueeFontFamily: ReceiptFontFamily;
  /** ISO datetime — hide marquee after this moment (empty = no expiry) */
  marqueeEndAt: string;
  /** Show on main POS tabs */
  marqueeOnPos: boolean;
  /** Show on /client customer display */
  marqueeOnClient: boolean;
  /** Show on /kds kitchen display */
  marqueeOnKds: boolean;
  /** Show on /bar display */
  marqueeOnBar: boolean;
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
  /** Allow selecting multiple options in the group (future; order UI is single-select today). */
  multi?: boolean;
  options: MenuOptionChoice[];
}

/** Global reusable option group (Settings → Menu catalog). */
export interface OptionGroupLibraryEntry {
  id: string;
  nameEn: string;
  nameCz: string;
  nameZh: string;
  required: boolean;
  multi: boolean;
  options: MenuOptionChoice[];
  displayOrder: number;
  active: boolean;
}

export interface MenuCustomizationConfig {
  basePriceFromOptions?: boolean;
  /**
   * Inline / legacy groups embedded on the item.
   * After library resolve, also includes groups copied from optionGroupLibraryIds.
   */
  optionGroups?: MenuOptionGroup[];
  /**
   * References into option_group_library. Resolved into optionGroups at menu load
   * so order / print / customize keep using embedded config.
   */
  optionGroupLibraryIds?: string[];
  /**
   * Which note_presets apply when adding notes to this item.
   * undefined = all presets (legacy); [] = none; otherwise filter.
   */
  allowedSpecialRequestIds?: string[];
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
  /** Do not print this line on kitchen/bar tickets. */
  skipPrint?: boolean;
  /** Do not show on KDS/Bar display or new-order alerts. */
  hideOnKds?: boolean;
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
  /** Food vs drink — used for receipt VAT when not linked to menu. */
  itemType?: MenuItem["itemType"];
  /** Receipt VAT group when not resolved from menu catalog. */
  taxGroup?: TaxGroup;
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
  /** VAT group: A = 21% (drinks), B = 12% (food). Defaults from itemType. */
  taxGroup?: TaxGroup;
  sortOrder: number;
  /** Bill only — no kitchen, bar, or print when ordered. */
  billOnly?: boolean;
  customizationConfig?: MenuCustomizationConfig;
}

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  pin?: string;
  active: boolean;
  /**
   * Custom POS tabs this member may see. When empty/undefined, role defaults apply.
   */
  allowedNav?: NavId[];
  /** When true, sensitive actions prompt for a manager PIN. Default: off. */
  requirePinForActions?: boolean;
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
  /** Dine-in (Jídelna) vs takeaway (S sebou) for tax summary. */
  serviceChannel?: ServiceChannel;
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
  /** Denormalized for display (table activity snapshot) */
  itemName?: string;
  meta?: Record<string, unknown>;
}

export interface TableActivityLogEntry {
  id: string;
  tableId?: string;
  tableLabel?: string;
  orderItemId?: string;
  itemName?: string;
  action: string;
  staffName: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}
