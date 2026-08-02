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
const API_TIMEOUT_MS = 3000;

function cleanNoteText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

interface MyMemoryResponse {
  responseData?: {
    translatedText?: string;
  };
}

export async function translateNoteToChinese(text: string): Promise<string> {
  const cleaned = cleanNoteText(text);
  if (!cleaned) return text.trim();

  const localMatch = LOCAL_DICT[cleaned];
  if (localMatch) return localMatch;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text.trim())}&langpair=en|zh-CN`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return text.trim();

    const payload = (await response.json()) as MyMemoryResponse;
    const translated = payload.responseData?.translatedText?.trim();
    if (!translated) return text.trim();

    return translated;
  } catch {
    return text.trim();
  }
}
