/** Light-mode shell background presets (pastel + default + custom). */

export type LightBgPresetId =
  | "default"
  | "mist"
  | "blush"
  | "peach"
  | "cream"
  | "mint"
  | "lavender"
  | "sky";

export type LightBackgroundSelection =
  | { kind: "preset"; id: LightBgPresetId }
  | { kind: "custom"; hex: string };

export const LIGHT_BG_STORAGE_KEY = "pos-light-bg";

export const LIGHT_BG_PRESETS: ReadonlyArray<{
  id: LightBgPresetId;
  /** Soft pastel / neutral shell fill — keeps dark text readable. */
  background: string;
  /** Slightly deeper tint for subtle accents / muted chips. */
  accent: string;
  labelKey:
    | "lightBgDefault"
    | "lightBgMist"
    | "lightBgBlush"
    | "lightBgPeach"
    | "lightBgCream"
    | "lightBgMint"
    | "lightBgLavender"
    | "lightBgSky";
}> = [
  { id: "default", background: "#f9fafb", accent: "#f3f4f6", labelKey: "lightBgDefault" },
  { id: "mist", background: "#eef3f8", accent: "#e2ebf3", labelKey: "lightBgMist" },
  { id: "blush", background: "#fdf2f4", accent: "#f8e4e8", labelKey: "lightBgBlush" },
  { id: "peach", background: "#fff1e8", accent: "#ffe4d4", labelKey: "lightBgPeach" },
  { id: "cream", background: "#faf6ef", accent: "#f3ebe0", labelKey: "lightBgCream" },
  { id: "mint", background: "#eef8f3", accent: "#dff1e7", labelKey: "lightBgMint" },
  { id: "lavender", background: "#f3f0fa", accent: "#e8e3f5", labelKey: "lightBgLavender" },
  { id: "sky", background: "#eef6fb", accent: "#ddeef8", labelKey: "lightBgSky" },
] as const;

const PRESET_BY_ID = Object.fromEntries(LIGHT_BG_PRESETS.map((p) => [p.id, p])) as Record<
  LightBgPresetId,
  (typeof LIGHT_BG_PRESETS)[number]
>;

export function normalizeHexColor(raw: string, fallback = "#f9fafb"): string {
  const trimmed = raw.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const full = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (full) return `#${full[1].toLowerCase()}`;
  return fallback;
}

/** Mix hex toward white for a soft accent companion. */
export function softAccentFromBackground(hex: string): string {
  const normalized = normalizeHexColor(hex);
  const n = Number.parseInt(normalized.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (channel: number) => Math.round(channel * 0.92 + 255 * 0.08);
  const toHex = (channel: number) => mix(channel).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function resolveLightBackgroundColors(selection: LightBackgroundSelection): {
  background: string;
  accent: string;
} {
  if (selection.kind === "custom") {
    const background = normalizeHexColor(selection.hex);
    return { background, accent: softAccentFromBackground(background) };
  }
  const preset = PRESET_BY_ID[selection.id] ?? PRESET_BY_ID.default;
  return { background: preset.background, accent: preset.accent };
}

export function serializeLightBackground(selection: LightBackgroundSelection): string {
  if (selection.kind === "custom") return `custom:${normalizeHexColor(selection.hex)}`;
  return selection.id;
}

export function parseLightBackground(raw: string | null | undefined): LightBackgroundSelection {
  if (!raw || raw === "default") return { kind: "preset", id: "default" };
  if (raw.startsWith("custom:")) {
    return { kind: "custom", hex: normalizeHexColor(raw.slice("custom:".length)) };
  }
  if (raw in PRESET_BY_ID) return { kind: "preset", id: raw as LightBgPresetId };
  if (raw.startsWith("#")) return { kind: "custom", hex: normalizeHexColor(raw) };
  return { kind: "preset", id: "default" };
}

export function readStoredLightBackground(): LightBackgroundSelection {
  if (typeof window === "undefined") return { kind: "preset", id: "default" };
  return parseLightBackground(localStorage.getItem(LIGHT_BG_STORAGE_KEY));
}

export function applyLightBackgroundToDocument(
  selection: LightBackgroundSelection,
  themeMode: "light" | "dark",
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (themeMode === "dark") {
    root.style.removeProperty("--background");
    root.style.removeProperty("--accent");
    root.removeAttribute("data-light-bg");
    return;
  }
  const { background, accent } = resolveLightBackgroundColors(selection);
  root.style.setProperty("--background", background);
  root.style.setProperty("--accent", accent);
  root.setAttribute(
    "data-light-bg",
    selection.kind === "custom" ? "custom" : selection.id,
  );
}
