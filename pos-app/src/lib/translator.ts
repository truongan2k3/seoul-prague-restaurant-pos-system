/**
 * Kitchen-note EN→ZH translator for Seoul Prague POS.
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
  "no parsley": "不要香菜",
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
  "no MSG": "不要味精",
  "no msg": "不要味精",
  "less salt": "少盐",
  "no salt": "无盐",
  "extra chili": "加辣椒",
  "no chili": "不要辣椒",
  "cut in half": "一切两半",
  "happy birthday": "生日快乐",
  "separate bill": "分开结账",
  "no oil": "少油",
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
  // Czech — occasional
  "bez cibule": "不要洋葱",
  "bez česneku": "不要蒜",
  "bez koriandru": "不要香菜",
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
/** Chrome dictionary endpoint — works as EN→ZH fallback when MyMemory quotas out. */
const GOOGLE_DICT_URL = "https://clients5.google.com/translate_a/t";
const API_TIMEOUT_MS = 6000;

function cleanNoteText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
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

function isUsableChineseTranslation(translated: string): boolean {
  const trimmed = translated.trim();
  if (!trimmed) return false;
  if (/MYMEMORY WARNING/i.test(trimmed)) return false;
  return hasChinese(trimmed);
}

/**
 * Staff notes are primarily English. Only flip to VI/CS when distinctive
 * characters appear (avoid treating English as Czech).
 */
function detectSourceLang(text: string): "en" | "cs" | "vi" {
  if (
    /[ạảãâầấậẩẫăằắặẳẵẹẻẽêềếệểễịỉĩọỏõôồốộổỗơờớợởỡụủũưừứựửữỳýỵỷỹđ]/i.test(
      text,
    )
  ) {
    return "vi";
  }
  // Distinctive Czech letters only (not á/é/í shared with many langs — English-first POS).
  if (/[ěščřžýůďťň]/i.test(text)) {
    return "cs";
  }
  return "en";
}

function langPairsFor(source: "en" | "cs" | "vi"): string[] {
  // English first always — primary staff language.
  if (source === "cs") return ["en|zh-CN", "cs|zh-CN"];
  if (source === "vi") return ["en|zh-CN", "vi|zh-CN"];
  return ["en|zh-CN"];
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "SeoulPraguePOS/1.0" },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateViaMyMemory(text: string, langpair: string): Promise<string | null> {
  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text.trim())}&langpair=${encodeURIComponent(langpair)}`;
  const response = await fetchWithTimeout(url);
  if (!response?.ok) return null;
  try {
    const payload = (await response.json()) as MyMemoryResponse;
    if (payload.quotaFinished) return null;
    const status = Number(payload.responseStatus);
    if (Number.isFinite(status) && status !== 200) return null;
    const translated = payload.responseData?.translatedText?.trim();
    if (!translated || /MYMEMORY WARNING/i.test(translated)) return null;
    return translated;
  } catch {
    return null;
  }
}

/** Google dictionary translate — reliable EN→ZH backup. */
async function translateViaGoogleDict(
  text: string,
  sourceLang: "en" | "cs" | "vi" | "auto" = "en",
): Promise<string | null> {
  const sl = sourceLang === "cs" ? "cs" : sourceLang === "vi" ? "vi" : sourceLang === "auto" ? "auto" : "en";
  const url =
    `${GOOGLE_DICT_URL}?client=dict-chrome-ex` +
    `&sl=${encodeURIComponent(sl)}&tl=zh-CN&q=${encodeURIComponent(text.trim())}`;
  const response = await fetchWithTimeout(url);
  if (!response?.ok) return null;
  try {
    const payload = (await response.json()) as unknown;
    // Shape: ["中文"] or [["中文","src",...], ...] depending on client.
    if (Array.isArray(payload)) {
      const first = payload[0];
      if (typeof first === "string" && first.trim()) return first.trim();
      if (Array.isArray(first) && typeof first[0] === "string" && first[0].trim()) {
        return first[0].trim();
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function translateWithApis(
  text: string,
  source: "en" | "cs" | "vi",
): Promise<string | null> {
  for (const pair of langPairsFor(source)) {
    const translated = await translateViaMyMemory(text, pair);
    if (translated && isUsableChineseTranslation(translated)) return translated;
  }

  const google = await translateViaGoogleDict(text, source === "en" ? "en" : source);
  if (google && isUsableChineseTranslation(google)) return google;

  if (source !== "en") {
    const googleEn = await translateViaGoogleDict(text, "en");
    if (googleEn && isUsableChineseTranslation(googleEn)) return googleEn;
  }

  const googleAuto = await translateViaGoogleDict(text, "auto");
  if (googleAuto && isUsableChineseTranslation(googleAuto)) return googleAuto;

  return null;
}

/** Translate free-text notes / kitchen messages to Simplified Chinese. */
export async function translateNoteToChinese(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const cleaned = cleanNoteText(trimmed);
  const localMatch = LOCAL_DICT[cleaned];
  if (localMatch) return localMatch;

  // Already Chinese-looking (no Latin letters mixed in)
  if (hasChinese(trimmed) && !/[a-zàáạảãâầấěščřžý]/i.test(trimmed)) {
    return trimmed;
  }

  // Translate comma/semicolon segments independently (preset + free text mixes).
  const segments = trimmed
    .split(/[,;|/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length > 1) {
    const translatedSegments = await Promise.all(
      segments.map((segment) => translateNoteToChinese(segment)),
    );
    if (translatedSegments.some((part) => hasChinese(part))) {
      return translatedSegments.join("，");
    }
  }

  const source = detectSourceLang(trimmed);
  const translated = await translateWithApis(trimmed, source);
  if (translated) return translated;

  return trimmed;
}
