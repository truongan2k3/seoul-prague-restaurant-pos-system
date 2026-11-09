"use server";

import { translateNoteToChinese, translateNoteToChineseWithSource, type NoteTranslationResult } from "@/src/lib/translator";

/** Server-side translation for notes / kitchen messages (avoids browser CORS limits). */
export async function translateNoteToChineseAction(text: string): Promise<string> {
  return translateNoteToChinese(text);
}

/** Preview metadata comes from the actual provider, including cache provenance. */
export async function translateNoteToChineseWithSourceAction(text: string): Promise<NoteTranslationResult> {
  return translateNoteToChineseWithSource(text);
}
