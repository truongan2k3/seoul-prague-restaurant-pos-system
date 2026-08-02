let audioContext: AudioContext | null = null;
let unlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  return audioContext;
}

/** Call once after user interaction so autoplay policies allow sounds. */
export function unlockNotificationAudio() {
  const ctx = getAudioContext();
  if (!ctx || unlocked) return;
  void ctx.resume().then(() => {
    unlocked = true;
  });
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

const DEFAULT_SOUND_URL = "/sounds/default-bell.mp3";

export function playCustomAlertSound(
  url: string,
  variant: "ready" | "newOrder" = "ready",
) {
  if (!url || url === DEFAULT_SOUND_URL || url.endsWith(DEFAULT_SOUND_URL)) {
    if (variant === "newOrder") playNewOrderBell();
    else playReadyBell();
    return;
  }

  const audio = new Audio(url);
  audio.volume = 0.85;
  void audio.play().catch(() => {
    if (variant === "newOrder") playNewOrderBell();
    else playReadyBell();
  });
}

export function playTestAlertSound(url: string) {
  playCustomAlertSound(url, "newOrder");
}

function playBellTone(frequencies: number[], durationSec: number) {
  const ctx = getAudioContext();
  if (!ctx) return;

  void ctx.resume().then(() => {
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.35, now + 0.015);
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
  });
}
