/** Guest "Chat With Us" — shared types + client session helpers. */

export type GuestChatPage = "landing" | "reservation" | "other";

export type GuestChatSessionStatus =
  | "open"
  | "waiting"
  | "replied"
  | "follow_up"
  | "resolved"
  | "closed";

export type GuestChatSender = "guest" | "staff" | "system";

export interface GuestChatConfig {
  enabled: boolean;
  welcomeMessage: string;
  offlineMessage: string;
  /** Minutes after last guest message before offering email follow-up. */
  unansweredMinutes: number;
  /** When true, show Online only during reservation operating hours. */
  onlineDuringBusinessHours: boolean;
  /** Auto-close inactive sessions after this many hours. */
  autoArchiveHours: number;
}

export const DEFAULT_GUEST_CHAT_CONFIG: GuestChatConfig = {
  enabled: true,
  welcomeMessage: "Hello! How can we help you today?",
  offlineMessage:
    "Our team is currently unavailable. Would you like us to contact you?",
  unansweredMinutes: 5,
  onlineDuringBusinessHours: true,
  autoArchiveHours: 72,
};

export interface GuestChatSession {
  id: string;
  guestClientId: string;
  page: GuestChatPage;
  status: GuestChatSessionStatus;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  lastMessageAt: string;
  lastGuestMessageAt?: string | null;
  lastStaffMessageAt?: string | null;
  unreadByStaff: boolean;
  followUpOfferedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  preview?: string;
}

export interface GuestChatMessage {
  id: string;
  sessionId: string;
  sender: GuestChatSender;
  body: string;
  staffId?: string | null;
  staffName?: string | null;
  createdAt: string;
}

export const GUEST_CHAT_CLIENT_KEY = "guest-chat-client-id";
export const GUEST_CHAT_SESSION_KEY = "guest-chat-session-id";

export function parseGuestChatConfig(raw: unknown): GuestChatConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GUEST_CHAT_CONFIG };
  const row = raw as Record<string, unknown>;
  const unanswered = Number(row.unansweredMinutes ?? row.unanswered_minutes);
  const archive = Number(row.autoArchiveHours ?? row.auto_archive_hours);
  return {
    enabled:
      typeof row.enabled === "boolean" ? row.enabled : DEFAULT_GUEST_CHAT_CONFIG.enabled,
    welcomeMessage:
      typeof row.welcomeMessage === "string"
        ? row.welcomeMessage
        : typeof row.welcome_message === "string"
          ? row.welcome_message
          : DEFAULT_GUEST_CHAT_CONFIG.welcomeMessage,
    offlineMessage:
      typeof row.offlineMessage === "string"
        ? row.offlineMessage
        : typeof row.offline_message === "string"
          ? row.offline_message
          : DEFAULT_GUEST_CHAT_CONFIG.offlineMessage,
    unansweredMinutes:
      Number.isFinite(unanswered) && unanswered > 0
        ? Math.min(120, Math.round(unanswered))
        : DEFAULT_GUEST_CHAT_CONFIG.unansweredMinutes,
    onlineDuringBusinessHours:
      typeof row.onlineDuringBusinessHours === "boolean"
        ? row.onlineDuringBusinessHours
        : typeof row.online_during_business_hours === "boolean"
          ? row.online_during_business_hours
          : DEFAULT_GUEST_CHAT_CONFIG.onlineDuringBusinessHours,
    autoArchiveHours:
      Number.isFinite(archive) && archive > 0
        ? Math.min(720, Math.round(archive))
        : DEFAULT_GUEST_CHAT_CONFIG.autoArchiveHours,
  };
}

export function guestChatConfigToDb(config: GuestChatConfig) {
  return {
    enabled: config.enabled,
    welcomeMessage: config.welcomeMessage,
    offlineMessage: config.offlineMessage,
    unansweredMinutes: config.unansweredMinutes,
    onlineDuringBusinessHours: config.onlineDuringBusinessHours,
    autoArchiveHours: config.autoArchiveHours,
  };
}

export function createGuestClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `gc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readGuestClientId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(GUEST_CHAT_CLIENT_KEY)?.trim();
    if (existing) return existing;
    const next = createGuestClientId();
    localStorage.setItem(GUEST_CHAT_CLIENT_KEY, next);
    return next;
  } catch {
    return createGuestClientId();
  }
}

export function readStoredSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(GUEST_CHAT_SESSION_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function storeSessionId(sessionId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_CHAT_SESSION_KEY, sessionId);
  } catch {
    /* ignore */
  }
}

export function clearStoredSessionId() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(GUEST_CHAT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function guestChatStatusLabel(status: GuestChatSessionStatus): string {
  switch (status) {
    case "waiting":
      return "Waiting for reply";
    case "replied":
      return "Replied";
    case "follow_up":
      return "Follow-up";
    case "resolved":
      return "Resolved";
    case "closed":
      return "Closed";
    default:
      return "Online";
  }
}

export function isActiveGuestChatStatus(status: GuestChatSessionStatus): boolean {
  return status === "open" || status === "waiting" || status === "replied" || status === "follow_up";
}
