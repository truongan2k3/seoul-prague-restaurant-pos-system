/** PostgreSQL `integer` max is 2_147_483_647 — Date.now() ms overflows it. */
export function nextWebsiteSortOrder(): number {
  return Math.floor(Date.now() / 1000);
}
