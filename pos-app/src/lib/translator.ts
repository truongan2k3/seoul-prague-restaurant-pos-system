const LOCAL_DICT: Record<string, string> = {
  "no spicy": "不要辣",
  "not spicy": "不要辣",
  "less spicy": "微辣",
  mild: "微辣",
  "extra spicy": "特辣",
  "no onion": "不要洋葱",
  "no onions": "不要洋葱",
  "no coriander": "不要香菜",
  "no cilantro": "不要香菜",
  "less ice": "少冰",
  "no ice": "去冰",
  "extra rice": "加米饭",
  "extra sauce": "多放酱汁",
  takeaway: "打包",
  "to go": "打包",
  // Vietnamese
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
  // Common Czech kitchen notes
  "bez cibule": "不要洋葱",
  "bez cibule zelené": "不要葱",
  "bez česneku": "不要蒜",
  "bez koriandru": "不要香菜",
  "bez pálivého": "不要辣",
  "bez paliveho": "不要辣",
  "nechci pálivé": "不要辣",
  "nechci palive": "不要辣",
  "méně pálivé": "微辣",
  "mene palive": "微辣",
  "hodně pálivé": "特辣",
  "hodne palive": "特辣",
  "bez ledu": "去冰",
  "méně ledu": "少冰",
  "mene ledu": "少冰",
  "přibalit": "打包",
  "pribalit": "打包",
  "s sebou": "打包",
  "extra rýže": "加米饭",
  "extra ryze": "加米饭",
  "bez omáčky": "不要酱",
  "bez omacky": "不要酱",
};

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
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
  // Target is always Simplified Chinese — reject echo of Latin/Czech/Vietnamese source.
  return hasChinese(trimmed);
}

/**
 * Prague POS notes are usually Czech or English.
 * Do NOT treat á/é/í/ó/ú as Vietnamese — those overlap with Czech and caused
 * Czech notes to skip cs|zh-CN (MyMemory then echoed the source unchanged).
 */
function detectSourceLang(text: string): "en" | "cs" | "vi" {
  // Vietnamese: distinctive letters / tone marks. Include bare â/ê/ô (không, cơm…)
  // which Czech does not use — previously those notes were mis-labeled as English.
  if (
    /[ạảãâầấậẩẫăằắặẳẵẹẻẽêềếệểễịỉĩọỏõôồốộổỗơờớợởỡụủũưừứựửữỳýỵỷỹđ]/i.test(
      text,
    )
  ) {
    return "vi";
  }
  // Czech diacritics (and shared acute accents common on Czech tickets).
  if (/[ěščřžýáíéúůďťňóäöüß]/i.test(text)) {
    return "cs";
  }
  return "en";
}

function langPairsFor(source: "en" | "cs" | "vi"): string[] {
  // Always try Czech + English — this restaurant's notes are mostly those two.
  if (source === "cs") return ["cs|zh-CN", "en|zh-CN"];
  if (source === "vi") return ["vi|zh-CN", "en|zh-CN", "cs|zh-CN"];
  return ["en|zh-CN", "cs|zh-CN"];
}

async function translateViaMyMemory(text: string, langpair: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text.trim())}&langpair=${encodeURIComponent(langpair)}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = (await response.json()) as MyMemoryResponse;
    if (payload.quotaFinished) return null;
    const status = Number(payload.responseStatus);
    if (Number.isFinite(status) && status !== 200) return null;
    const translated = payload.responseData?.translatedText?.trim();
    if (!translated || /MYMEMORY WARNING/i.test(translated)) return null;
    return translated;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

  // Phrase-level local dict: translate comma/semicolon segments independently.
  const segments = trimmed
    .split(/[,;|/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length > 1) {
    const translatedSegments = await Promise.all(
      segments.map((segment) => translateNoteToChinese(segment)),
    );
    if (translatedSegments.every((part) => hasChinese(part) || LOCAL_DICT[cleanNoteText(part)])) {
      return translatedSegments.join("，");
    }
    if (translatedSegments.some((part, index) => part !== segments[index] && hasChinese(part))) {
      return translatedSegments.join("，");
    }
  }

  const source = detectSourceLang(trimmed);
  for (const pair of langPairsFor(source)) {
    const translated = await translateViaMyMemory(trimmed, pair);
    if (translated && isUsableChineseTranslation(translated)) {
      return translated;
    }
  }

  // Last resort: try the other primary pair once more if detection was wrong.
  const fallbackPairs = source === "cs" ? ["en|zh-CN"] : ["cs|zh-CN", "en|zh-CN"];
  for (const pair of fallbackPairs) {
    const translated = await translateViaMyMemory(trimmed, pair);
    if (translated && isUsableChineseTranslation(translated)) {
      return translated;
    }
  }

  return trimmed;
}
