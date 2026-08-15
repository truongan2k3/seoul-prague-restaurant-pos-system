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
};

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const API_TIMEOUT_MS = 4000;

function cleanNoteText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

interface MyMemoryResponse {
  quotaFinished?: boolean;
  responseData?: {
    translatedText?: string;
  };
}

function isUsableTranslation(source: string, translated: string): boolean {
  const trimmed = translated.trim();
  if (!trimmed) return false;
  if (/MYMEMORY WARNING/i.test(trimmed)) return false;
  if (/[\u4e00-\u9fff]/.test(trimmed)) return true;
  return cleanNoteText(trimmed) !== cleanNoteText(source);
}

function detectSourceLang(text: string): "en" | "cs" | "vi" {
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text)) {
    return "vi";
  }
  if (/[ěščřžýáíéúůďťňó]/i.test(text)) {
    return "cs";
  }
  return "en";
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

  // Already Chinese-looking
  if (/[\u4e00-\u9fff]/.test(trimmed) && !/[a-zàáạảãâầấ]/i.test(trimmed)) {
    return trimmed;
  }

  const source = detectSourceLang(trimmed);
  const pairs =
    source === "cs"
      ? ["cs|zh-CN", "en|zh-CN"]
      : source === "vi"
        ? ["en|zh-CN", "vi|zh-CN"]
        : ["en|zh-CN", "cs|zh-CN"];

  for (const pair of pairs) {
    const translated = await translateViaMyMemory(trimmed, pair);
    if (translated && isUsableTranslation(trimmed, translated)) {
      return translated;
    }
  }

  return trimmed;
}
