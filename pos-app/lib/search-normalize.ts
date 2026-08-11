/** Fold Czech/other diacritics so "kure" matches "kuře". */
export function foldDiacritics(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function matchesFoldedSearch(haystack: string, query: string): boolean {
  if (!query) return true;
  return foldDiacritics(haystack).includes(foldDiacritics(query));
}
