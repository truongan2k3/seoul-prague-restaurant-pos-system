import type { NotificationSoundCategory, NotificationSoundSettings } from "@/lib/types";

export const NOTIFICATION_SOUND_CATEGORIES: NotificationSoundCategory[] = ["kitchen", "bar", "newReservation", "cancelledReservation"];
export const DEFAULT_NOTIFICATION_SOUNDS: NotificationSoundSettings = {
  kitchen: { sounds: ["/sounds/new_order.mp3"], enabled: true },
  bar: { sounds: ["/sounds/bell.mp3"], enabled: true },
  newReservation: { sounds: ["/sounds/chime.mp3"], enabled: true },
  cancelledReservation: { sounds: ["/sounds/buzzer.mp3"], enabled: true },
};

export function parseNotificationSounds(value: unknown, legacy?: Record<string, unknown>): NotificationSoundSettings {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(NOTIFICATION_SOUND_CATEGORIES.map(category => {
    const row = raw[category] && typeof raw[category] === "object" ? raw[category] as Record<string, unknown> : {};
    const old = category === "kitchen" || category === "bar" ? legacy?.new_order ?? legacy?.newOrder
      : category === "newReservation" ? legacy?.reservation_reminder ?? legacy?.reservationReminder : undefined;
    const fallback = typeof old === "string" && old ? [old] : DEFAULT_NOTIFICATION_SOUNDS[category].sounds;
    const sounds = Array.isArray(row.sounds) ? [...new Set(row.sounds.filter((url): url is string => typeof url === "string" && url.length <= 2048 && /^(\/sounds\/|https?:\/\/)/i.test(url)))].slice(0, 12) : fallback;
    return [category, { sounds, enabled: category === "kitchen" || category === "bar" || row.enabled !== false }];
  })) as NotificationSoundSettings;
}

const SEEN_KEY = "pos:notification-events:v2";
const seen = new Set<string>();
const startedAt = typeof performance !== "undefined" ? performance.timeOrigin : Date.now();

/** Only genuine live events qualify. Durable IDs also suppress replay after refresh/reconnect. */
export function claimNotificationEvent(category: string, id: string, occurredAt: string | Date | undefined): boolean {
  if (typeof window === "undefined" || !id || !occurredAt) return false;
  const timestamp = new Date(occurredAt).getTime();
  if (!Number.isFinite(timestamp) || timestamp < startedAt - 2_000 || timestamp < Date.now() - 30_000 || timestamp > Date.now() + 60_000) return false;
  const key = `${category}:${id}`;
  if (seen.has(key)) return false;
  try {
    const saved = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as unknown;
    const entries = Array.isArray(saved) ? saved.filter((entry): entry is string => typeof entry === "string") : [];
    if (entries.includes(key)) { seen.add(key); return false; }
    localStorage.setItem(SEEN_KEY, JSON.stringify([...entries.slice(-999), key]));
  } catch { /* Session dedupe still works when browser storage is unavailable. */ }
  seen.add(key);
  if (seen.size > 2_000) seen.delete(seen.values().next().value!);
  return true;
}
