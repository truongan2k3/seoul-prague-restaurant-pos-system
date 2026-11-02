import type { NotificationSoundCategory, NotificationSoundSettings } from "@/lib/types";

let audioContext: AudioContext | null = null;
let unlocked = false;
export const NOTIFICATION_AUDIO_UNLOCKED = "pos:notification-audio-unlocked";
function markAudioUnlocked() {
  if (unlocked) return;
  unlocked = true;
  window.dispatchEvent(new Event(NOTIFICATION_AUDIO_UNLOCKED));
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  return audioContext;
}

function kickSilentBuffer(ctx: AudioContext) {
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    /* ignore */
  }
}

/** Call after user interaction so autoplay policies allow sounds. */
export function unlockNotificationAudio() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const markIfRunning = () => {
    if (ctx.state === "running") markAudioUnlocked();
  };

  kickSilentBuffer(ctx);
  markIfRunning();

  if (ctx.state === "running") return;

  void ctx.resume()
    .then(() => {
      kickSilentBuffer(ctx);
      markIfRunning();
    })
    .catch(() => {
      /* ignore — need a real user gesture */
    });
}

export function isNotificationAudioUnlocked(): boolean {
  const ctx = getAudioContext();
  if (ctx?.state === "running") {
    return true;
  }
  return false;
}

/** Short pleasant bell "ting" via Web Audio API. */
export function playReadyBell() {
  playBellTone([880, 1320, 1760], 0.55);
}

/** Double bell for new kitchen tickets. */
export function playNewOrderBell() {
  playBellTone([660, 990, 1320], 0.45);
  window.setTimeout(() => playBellTone([880, 1320, 1760], 0.55), 220);
}

/**
 * Louder, longer alert for dedicated Kitchen/Bar screens.
 * Always uses Web Audio (ignores missing /sounds/*.mp3 presets).
 */
export function playServerScreenNewOrderAlert() {
  unlockNotificationAudio();
  playBellTone([740, 988, 1174], 0.55, 0.7);
  window.setTimeout(() => playBellTone([880, 1174, 1480], 0.65, 0.75), 200);
  window.setTimeout(() => playBellTone([988, 1318, 1760], 0.7, 0.8), 420);
}

/** Urgent triple beep for pending reservation alerts (works without MP3 files). */
export function playReservationAlertBeep() {
  playBellTone([880, 1174], 0.32);
  window.setTimeout(() => playBellTone([880, 1174], 0.32), 260);
  window.setTimeout(() => playBellTone([1318, 1760], 0.42), 520);
}

const DEFAULT_SOUND_URL = "/sounds/default-bell.mp3";
/** Built-in preset paths — files are optional; fall back to Web Audio. */
const PRESET_SOUND_PREFIX = "/sounds/";
/** Fixed gap after a clip finishes before the next play (no overlap). */
const ALERT_LOOP_GAP_MS = 2_000;
/** Approx length of reservation triple-beep cycle. */
const RESERVATION_BEEP_MS = 1_000;
/** Approx length used when falling back to Web Audio double-bell. */
const BELL_FALLBACK_MS = 1_200;
/** If HTMLAudio never ends (404 / stalled), fall back to Web Audio. */
const HTML_AUDIO_WATCHDOG_MS = 4_000;

let alertLoopActive = false;
let alertLoopUrl = "";
let alertLoopVariant: "ready" | "newOrder" | "reservation" = "reservation";
let alertLoopGapMs = ALERT_LOOP_GAP_MS;
let alertLoopAudio: HTMLAudioElement | null = null;
let alertLoopTimer: number | null = null;
let alertLoopWatchdog: number | null = null;

function clearAlertLoopTimer() {
  if (alertLoopTimer != null) {
    window.clearTimeout(alertLoopTimer);
    alertLoopTimer = null;
  }
}

function clearAlertLoopWatchdog() {
  if (alertLoopWatchdog != null) {
    window.clearTimeout(alertLoopWatchdog);
    alertLoopWatchdog = null;
  }
}

function stopAlertLoopAudio() {
  clearAlertLoopWatchdog();
  if (!alertLoopAudio) return;
  try {
    alertLoopAudio.onended = null;
    alertLoopAudio.onerror = null;
    alertLoopAudio.pause();
    alertLoopAudio.removeAttribute("src");
    alertLoopAudio.load();
  } catch {
    /* ignore */
  }
  alertLoopAudio = null;
}

/** Stop any repeating reservation/alert sound loop. Safe to call when idle. */
export function stopAlertSoundLoop() {
  alertLoopActive = false;
  clearAlertLoopTimer();
  stopAlertLoopAudio();
}

export function isAlertSoundLoopActive(): boolean {
  return alertLoopActive;
}

function scheduleAlertLoopNext(delayMs: number) {
  clearAlertLoopTimer();
  if (!alertLoopActive) return;
  alertLoopTimer = window.setTimeout(() => {
    alertLoopTimer = null;
    playAlertLoopOnce();
  }, delayMs);
}

function isPresetSoundUrl(url: string): boolean {
  if (!url) return true;
  if (url === DEFAULT_SOUND_URL || url.endsWith(DEFAULT_SOUND_URL)) return true;
  try {
    const path = new URL(url, "http://local").pathname;
    return path.startsWith(PRESET_SOUND_PREFIX);
  } catch {
    return url.startsWith(PRESET_SOUND_PREFIX);
  }
}

function playWebAudioAlertOnce(variant: "ready" | "newOrder" | "reservation") {
  unlockNotificationAudio();
  if (variant === "reservation") {
    playReservationAlertBeep();
    return RESERVATION_BEEP_MS;
  }
  if (variant === "newOrder") {
    playNewOrderBell();
    return BELL_FALLBACK_MS;
  }
  playReadyBell();
  return BELL_FALLBACK_MS;
}

function playAlertLoopOnce() {
  if (!alertLoopActive) return;
  stopAlertLoopAudio();
  unlockNotificationAudio();

  const url = alertLoopUrl;
  const variant = alertLoopVariant;
  const gapMs = alertLoopGapMs;

  // Preset / missing local MP3s → Web Audio (reliable continuous browser alert).
  if (!url || isPresetSoundUrl(url)) {
    const toneMs = playWebAudioAlertOnce(variant === "ready" ? "ready" : variant === "newOrder" ? "newOrder" : "reservation");
    scheduleAlertLoopNext(gapMs + toneMs);
    return;
  }

  // Custom uploaded URL — try HTMLAudio, with watchdog fallback to Web Audio.
  const audio = new Audio(url);
  alertLoopAudio = audio;
  audio.preload = "auto";
  audio.volume = 0.9;

  const fallBackToWebAudio = () => {
    if (alertLoopAudio !== audio && alertLoopAudio != null) return;
    stopAlertLoopAudio();
    if (!alertLoopActive) return;
    const toneMs = playWebAudioAlertOnce(variant === "ready" ? "ready" : "reservation");
    scheduleAlertLoopNext(gapMs + toneMs);
  };

  audio.onended = () => {
    if (alertLoopAudio !== audio) return;
    clearAlertLoopWatchdog();
    alertLoopAudio = null;
    scheduleAlertLoopNext(gapMs);
  };
  audio.onerror = () => {
    fallBackToWebAudio();
  };

  alertLoopWatchdog = window.setTimeout(() => {
    alertLoopWatchdog = null;
    // Stalled / never-ended clip — keep the loop alive via Web Audio.
    if (alertLoopAudio === audio && alertLoopActive) {
      fallBackToWebAudio();
    }
  }, HTML_AUDIO_WATCHDOG_MS);

  void audio.play().catch(() => {
    fallBackToWebAudio();
  });
}

/**
 * Play an alert sound on a fixed interval until stopAlertSoundLoop().
 * Guarantees a single loop (restarts if already running) and no overlapping clips.
 */
export function startAlertSoundLoop(
  url: string,
  options?: {
    gapMs?: number;
    variant?: "ready" | "newOrder" | "reservation";
  },
) {
  stopAlertSoundLoop();
  unlockNotificationAudio();
  alertLoopActive = true;
  alertLoopUrl = url;
  alertLoopVariant = options?.variant ?? "reservation";
  alertLoopGapMs = options?.gapMs ?? ALERT_LOOP_GAP_MS;
  playAlertLoopOnce();
}

const soundBuffers = new Map<string, Promise<AudioBuffer | null>>();
const previousSounds = new Map<string, string>();

function loadSoundBuffer(url: string): Promise<AudioBuffer | null> {
  const existing = soundBuffers.get(url);
  if (existing) return existing;
  const pending = (async () => {
    const ctx = getAudioContext();
    if (!ctx) return null;
    try {
      let cache: Cache | null = null;
      try { if (typeof caches !== "undefined") cache = await caches.open("seoul-notification-sounds-v1"); } catch { /* Memory cache remains available. */ }
      let response = await cache?.match(url).catch(() => undefined);
      if (!response) {
        response = await fetch(url, { cache: "force-cache", credentials: "omit" });
        if (!response.ok) return null;
        if (cache) void cache.put(url, response.clone()).catch(() => {});
      }
      return await ctx.decodeAudioData(await response.arrayBuffer());
    } catch { return null; }
  })();
  soundBuffers.set(url, pending);
  return pending;
}

/** Built-in effects are synthesized locally: no missing-MP3 fetches or asset downloads. */
function playPreset(url: string, variant: "ready" | "newOrder") {
  const file = url.split("/").pop()?.split("?")[0];
  switch (file) {
    case "chime.mp3": playBellTone([659, 988, 1318], 0.8); break;
    case "success.mp3": playBellTone([523, 659, 784, 1047], 0.65); break;
    case "buzzer.mp3": playBellTone([220, 277, 330], 0.5, 0.55); break;
    case "new_order.mp3": playNewOrderBell(); break;
    case "bell.mp3": playReadyBell(); break;
    case "default-bell.mp3": playBellTone([784, 1174, 1568], 0.6); break;
    default: if (variant === "newOrder") playNewOrderBell(); else playReadyBell();
  }
}

export function preloadNotificationSounds(settings: NotificationSoundSettings, categories: NotificationSoundCategory[] = ["kitchen", "bar", "newReservation", "cancelledReservation"]) {
  if (typeof window === "undefined") return;
  const selected = new Set(categories.map(category => settings[category]).filter(row => row.enabled).flatMap(row => row.sounds));
  for (const url of soundBuffers.keys()) if (!selected.has(url)) soundBuffers.delete(url);
  for (const url of selected) if (!isPresetSoundUrl(url)) void loadSoundBuffer(url);
}

export function playNotificationCategory(category: NotificationSoundCategory, settings: NotificationSoundSettings, deviceEnabled = true) {
  const config = settings[category];
  if (!deviceEnabled || !config?.enabled || !config.sounds.length || !isNotificationAudioUnlocked()) return;
  let previous = previousSounds.get(category);
  try { previous ??= localStorage.getItem(`pos:last-notification-sound:${category}`) ?? undefined; } catch { /* Memory fallback. */ }
  const alternatives = config.sounds.filter(url => url !== previous);
  const pool = alternatives.length ? alternatives : config.sounds;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  previousSounds.set(category, chosen);
  try { localStorage.setItem(`pos:last-notification-sound:${category}`, chosen); } catch { /* Memory fallback. */ }
  playCustomAlertSound(chosen, "newOrder");
}

export function playCustomAlertSound(url: string, variant: "ready" | "newOrder" = "ready") {
  unlockNotificationAudio();
  if (!url || isPresetSoundUrl(url)) { playPreset(url, variant); return; }
  const requestedAt = Date.now();
  void loadSoundBuffer(url).then(buffer => {
    const ctx = getAudioContext();
    // Never replay a stale notification when the browser eventually permits audio.
    if (!ctx || ctx.state !== "running" || Date.now() - requestedAt > 5_000) return;
    if (!buffer) { playPreset("", variant); return; }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain(); gain.gain.value = 0.85;
    source.connect(gain); gain.connect(ctx.destination);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start();
  });
}

export function playTestAlertSound(url: string) {
  const ctx = getAudioContext();
  if (!ctx) return;
  unlockNotificationAudio();
  if (ctx.state === "running") playCustomAlertSound(url, "newOrder");
  else void ctx.resume().then(() => playCustomAlertSound(url, "newOrder")).catch(() => {});
}

export function playPaymentSuccessSound(url?: string) {
  if (url) {
    playCustomAlertSound(url, "ready");
    return;
  }
  playBellTone([523, 659, 784, 1047], 0.65);
}

export function playCallWaiterSound(url?: string) {
  if (url) {
    playCustomAlertSound(url, "newOrder");
    return;
  }
  playBellTone([1047, 784, 1047, 1319], 0.7);
}

/** Soft ascending welcome for Client Screen check-in. */
export function playCfdWelcomeSound(url?: string) {
  if (url) {
    playCustomAlertSound(url, "ready");
    return;
  }
  playBellTone([523, 659, 784, 1047], 0.85);
}

export function playCancelAlertSound() {
  playBellTone([440, 330, 220], 0.5);
}

function playBellTone(frequencies: number[], durationSec: number, peakGain = 0.4) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const run = () => {
    const now = ctx.currentTime;
    const peak = Math.max(0.05, Math.min(peakGain, 0.9));

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(peak, now + 0.015);
    master.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    master.connect(ctx.destination);

    const partials = frequencies.map((freq, index) => ({
      freq,
      gain: index === 0 ? 1 : index === 1 ? 0.45 : 0.2,
    }));

    for (const { freq, gain } of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.92, now + durationSec * 0.75);

      const partialGain = ctx.createGain();
      partialGain.gain.setValueAtTime(gain, now);

      osc.connect(partialGain);
      partialGain.connect(master);
      osc.start(now);
      osc.stop(now + durationSec);
    }
  };

  if (ctx.state === "running") {
    markAudioUnlocked();
    run();
    return;
  }

  void ctx
    .resume()
    .then(() => {
      if (ctx.state !== "running") return;
      markAudioUnlocked();
      run();
    })
    .catch(() => {
      /* autoplay blocked until user gesture */
    });
}
