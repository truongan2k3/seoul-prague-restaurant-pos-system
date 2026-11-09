/**
 * Kitchen-note EN/CS/VI→ZH translator for Seoul Prague POS.
 * Staff notes are primarily English; Czech/Vietnamese are secondary.
 */

const LOCAL_DICT: Record<string, string> = {
  // English — primary (staff notes)
  "no spicy": "不要辣",
  "not spicy": "不要辣",
  "no spice": "不要辣",
  "without spicy": "不要辣",
  "please not spicy": "不要辣",
  "make it not spicy": "不要辣",
  "less spicy": "微辣",
  "little spicy": "微辣",
  mild: "微辣",
  "extra spicy": "特辣",
  "very spicy": "特辣",
  "more spicy": "多辣",
  "no onion": "不要洋葱",
  "no onions": "不要洋葱",
  "without onion": "不要洋葱",
  "without onions": "不要洋葱",
  "no spring onion": "不要葱",
  "no green onion": "不要葱",
  "no garlic": "不要蒜",
  "no coriander": "不要香菜",
  "no cilantro": "不要香菜",
  "no parsley": "不要欧芹",
  "less ice": "少冰",
  "no ice": "去冰",
  "extra ice": "多冰",
  "extra rice": "加米饭",
  "more rice": "加米饭",
  "extra sauce": "多放酱汁",
  "less sauce": "少酱",
  "no sauce": "不要酱",
  "on the side": "酱汁另放",
  "sauce on the side": "酱汁另放",
  takeaway: "打包",
  "take away": "打包",
  "to go": "打包",
  "for here": "堂食",
  "well done": "全熟",
  "medium well": "七分熟",
  medium: "五分熟",
  "medium rare": "三分熟",
  rare: "一分熟",
  "no peanuts": "不要花生",
  "allergy peanuts": "花生过敏",
  "peanut allergy": "花生过敏",
  "no nuts": "不要坚果",
  "nut allergy": "坚果过敏",
  "no seafood": "不要海鲜",
  "seafood allergy": "海鲜过敏",
  "gluten free": "无麸质",
  "no gluten": "无麸质",
  "no msg": "不要味精",
  "less salt": "少盐",
  "no salt": "无盐",
  "extra chili": "加辣椒",
  "no chili": "不要辣椒",
  "cut in half": "一切两半",
  "happy birthday": "生日快乐",
  "separate bill": "分开结账",
  "no oil": "不要油",
  "less oil": "少油",
  "extra egg": "加蛋",
  "no egg": "不要蛋",
  "urgent": "加急",
  asap: "加急",
  // Vietnamese — occasional
  "không cay": "不要辣",
  "khong cay": "不要辣",
  "ít cay": "微辣",
  "it cay": "微辣",
  "cay nhiều": "特辣",
  "cay nhieu": "特辣",
  "không hành": "不要洋葱",
  "khong hanh": "不要洋葱",
  "không đá": "去冰",
  "khong da": "去冰",
  "ít đá": "少冰",
  "it da": "少冰",
  "mang về": "打包",
  "mang ve": "打包",
  "không dầu": "不要油",
  "khong dau": "不要油",
  "ít dầu": "少油",
  "it dau": "少油",
  // Czech — occasional
  "bez cibule": "不要洋葱",
  "bez česneku": "不要蒜",
  "bez koriandru": "不要香菜",
  "bez petržele": "不要欧芹",
  "bez petrzele": "不要欧芹",
  "bez oleje": "不要油",
  "méně oleje": "少油",
  "mene oleje": "少油",
  "bez pálivého": "不要辣",
  "bez paliveho": "不要辣",
  "nechci pálivé": "不要辣",
  "nechci palive": "不要辣",
  "méně pálivé": "微辣",
  "mene palive": "微辣",
  "bez ledu": "去冰",
  "s sebou": "打包",
  "extra rýže": "加米饭",
  "extra ryze": "加米饭",
};

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
/** Existing keyless Chrome endpoint; unofficial, so keep a separate fallback. */
const GOOGLE_DICT_URL = "https://clients5.google.com/translate_a/t";
const API_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const CACHE_MAX_KEY_LENGTH = 4000;

export type NoteTranslationResult = {
  text: string;
  provider: "google" | "mymemory" | "local" | "original" | "unavailable";
  cached: boolean;
};

// Best-effort, per server instance: cold starts clear this cache. No note persistence.
const translationCache = new Map<string, { result: NoteTranslationResult; expiresAt: number }>();
const pendingTranslations = new Map<string, Promise<NoteTranslationResult>>();

type SourceLanguage = "en" | "cs" | "vi";

function cleanNoteText(text: string): string {
  return text.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

function localTranslation(text: string): string | undefined {
  const key = cleanNoteText(text);
  return Object.prototype.hasOwnProperty.call(LOCAL_DICT, key) ? LOCAL_DICT[key] : undefined;
}

interface MyMemoryResponse {
  quotaFinished?: boolean;
  responseStatus?: number | string;
  responseData?: {
    translatedText?: string;
  };
}

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function isUsableChineseTranslation(translated: string, original: string): boolean {
  const trimmed = translated.trim();
  return Boolean(trimmed && trimmed !== original.trim()
    && !/MYMEMORY WARNING/i.test(trimmed) && hasChinese(trimmed));
}

/** Google auto-detects; these conservative hints select the MyMemory fallback pair. */
function detectSourceLang(text: string): SourceLanguage {
  const normalized = text.normalize("NFC");
  // Do not classify ý as Vietnamese: it also occurs frequently in Czech.
  if (/[ạảãâầấậẩẫăằắặẳẵẹẻẽêềếệểễịỉĩọỏõôồốộổỗơờớợởỡụủũưừứựửữỳỵỷỹđ]/i.test(normalized)) {
    return "vi";
  }
  if (/[ěščřžůďťň]/i.test(normalized)) return "cs";
  // Recognize common kitchen terms even when staff omit accents.
  const words = cleanNoteText(normalized);
  if (/\b(khong|nhieu|nuoc|thit|dau|hanh)\b/.test(words)) return "vi";
  if (/\b(bez|mene|prosim|cibule|cesneku|palive|omacku|sebou|oleje)\b/.test(words)) return "cs";
  return "en";
}

/** Include response-body parsing in the timeout, not just response headers. */
async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "User-Agent": "SeoulPraguePOS/1.0" },
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateViaMyMemory(text: string, source: SourceLanguage): Promise<string | null> {
  // MyMemory's query limit is 500 UTF-8 bytes. Longer notes still get the Google attempt.
  if (new TextEncoder().encode(text).length > 500) return null;
  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`${source}|zh-CN`)}`;
  const payload = await fetchJsonWithTimeout(url) as MyMemoryResponse | null;
  if (!payload || payload.quotaFinished) return null;
  const status = Number(payload.responseStatus);
  if (Number.isFinite(status) && status !== 200) return null;
  const translated = payload.responseData?.translatedText;
  return typeof translated === "string" && isUsableChineseTranslation(translated, text)
    ? translated.trim() : null;
}

async function translateViaGoogle(text: string): Promise<string | null> {
  // Auto detection handles English, Czech, Vietnamese, and mixed-language staff notes.
  const url = `${GOOGLE_DICT_URL}?client=dict-chrome-ex&sl=auto&tl=zh-CN&q=${encodeURIComponent(text)}`;
  const payload = await fetchJsonWithTimeout(url);
  if (!Array.isArray(payload)) return null;

  // The existing endpoint returns either ["translation"] or [["translation", ...], ...].
  const translated = typeof payload[0] === "string"
    ? payload[0]
    : payload.filter(Array.isArray).map(part => typeof part[0] === "string" ? part[0] : "").join("");
  return isUsableChineseTranslation(translated, text) ? translated.trim() : null;
}

async function translateWithApis(text: string): Promise<NoteTranslationResult | null> {
  const google = await translateViaGoogle(text);
  if (google) return { text: google, provider: "google", cached: false };
  // Use the detected source directly; never force English ahead of Czech/Vietnamese.
  const memory = await translateViaMyMemory(text, detectSourceLang(text));
  return memory ? { text: memory, provider: "mymemory", cached: false } : null;
}

function cacheTranslation(key: string, result: NoteTranslationResult) {
  const now = Date.now();
  for (const [entryKey, entry] of translationCache) {
    if (entry.expiresAt <= now) translationCache.delete(entryKey);
  }
  translationCache.delete(key);
  if (translationCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) translationCache.delete(oldest);
  }
  translationCache.set(key, { result, expiresAt: now + CACHE_TTL_MS });
}

/** Translate notes only; callers retain the original in the separate notes field. */
export async function translateNoteToChineseWithSource(text: string): Promise<NoteTranslationResult> {
  const trimmed = text.normalize("NFC").trim();
  if (!trimmed) return { text: "", provider: "original", cached: false };

  const localMatch = localTranslation(trimmed);
  if (localMatch) return { text: localMatch, provider: "local", cached: false };

  if (hasChinese(trimmed) && !/\p{Script=Latin}/u.test(trimmed)) {
    return { text: trimmed, provider: "original", cached: false };
  }

  // Compose only fully known phrases locally. Send other notes as a whole so commas,
  // fractions, and ingredient relationships keep their meaning and context.
  const segments = trimmed.split(/[,;|\n]+/).map(part => part.trim()).filter(Boolean);
  if (segments.length > 1) {
    const localSegments = segments.map(localTranslation);
    if (localSegments.every((part): part is string => Boolean(part))) {
      return { text: localSegments.join("，"), provider: "local", cached: false };
    }
  }

  // Preserve case and punctuation in cache keys; they can carry meaning in notes.
  const key = trimmed;
  const cacheable = key.length <= CACHE_MAX_KEY_LENGTH;
  if (cacheable) {
    const cached = translationCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      translationCache.delete(key);
      translationCache.set(key, cached);
      return { ...cached.result, cached: true };
    }
    if (cached) translationCache.delete(key);
    const pending = pendingTranslations.get(key);
    if (pending) return pending;
  }

  const pending = translateWithApis(trimmed).catch(() => null).then(translated => {
    // Never cache failures, warnings, or untranslated source text.
    if (translated && cacheable) cacheTranslation(key, translated);
    return translated ?? { text: trimmed, provider: "unavailable" as const, cached: false };
  });
  const tracked = cacheable && pendingTranslations.size < CACHE_MAX_ENTRIES;
  if (tracked) pendingTranslations.set(key, pending);
  try {
    return await pending;
  } finally {
    if (tracked && pendingTranslations.get(key) === pending) pendingTranslations.delete(key);
  }
}

/** Compatibility entry point for order saving and printing: text only, never attribution. */
export async function translateNoteToChinese(text: string): Promise<string> {
  return (await translateNoteToChineseWithSource(text)).text;
}
