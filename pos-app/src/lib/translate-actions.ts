"use server";

import { translateNoteToChinese } from "@/src/lib/translator";

/** Server-side translation for notes / kitchen messages (avoids browser CORS limits). */
export async function translateNoteToChineseAction(text: string): Promise<string> {
  return translateNoteToChinese(text);
}
