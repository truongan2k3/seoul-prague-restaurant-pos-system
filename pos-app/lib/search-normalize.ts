/** Fold Czech/other diacritics so "kure" matches "kuře". */
export function foldDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d");
}

export function matchesFoldedSearch(haystack: string, query: string): boolean {
  if (!query) return true;
  return foldDiacritics(haystack).includes(foldDiacritics(query));
}

/** Match each name independently so initials never span unrelated translations. */
export function menuNameSearchRank(name: string, query: string): number {
  const text = foldDiacritics(name);
  const term = foldDiacritics(query).trim();
  if (!term || text === term) return 0;
  // Parentheses, hyphens and other separators are word boundaries: (Na Medu) → NM.
  const initials = (text.match(/[\p{L}\p{N}]+/gu) ?? []).map((word) => [...word][0]).join("");
  const abbreviation = term.replace(/[^\p{L}\p{N}]/gu, "");
  if (abbreviation && initials === abbreviation) return 1;
  if (text.startsWith(term) || (abbreviation && initials.startsWith(abbreviation))) return 2;
  if (text.includes(term)) return 3;
  return Infinity;
}
