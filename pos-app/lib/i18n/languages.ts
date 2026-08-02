import type { LanguageCode } from "@/lib/types";

export const LANGUAGE_OPTIONS: {
  code: LanguageCode;
  flag: string;
  label: string;
}[] = [
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "cs", flag: "🇨🇿", label: "Czech" },
  { code: "zh", flag: "🇨🇳", label: "Chinese" },
];

export function languageLabel(code: LanguageCode): string {
  return LANGUAGE_OPTIONS.find((l) => l.code === code)?.label ?? "English";
}
