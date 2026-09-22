/** Normalize email for matching returning guests. */
export function normalizeEmail(email?: string | null): string | null {
  const value = email?.trim().toLowerCase();
  return value || null;
}

/** Digits-only phone; null if too short to be useful. */
export function normalizePhoneDigits(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

/** Compare phones allowing optional country-code prefixes (e.g. CZ +420). */
export function phonesMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizePhoneDigits(a);
  const right = normalizePhoneDigits(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const tail = (value: string) => (value.length > 9 ? value.slice(-9) : value);
  const leftTail = tail(left);
  const rightTail = tail(right);
  return leftTail === rightTail && Math.min(left.length, right.length) >= 9;
}

export function emailsMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizeEmail(a);
  const right = normalizeEmail(b);
  return Boolean(left && right && left === right);
}

/** True when email or phone identifies the same guest. */
export function guestIdentityMatches(
  left: { email?: string | null; phone?: string | null },
  right: { email?: string | null; phone?: string | null },
): boolean {
  if (emailsMatch(left.email, right.email)) return true;
  if (phonesMatch(left.phone, right.phone)) return true;
  return false;
}

/** Last 9 digits for fuzzy Supabase `ilike` lookups. */
export function phoneLookupTail(phone?: string | null): string | null {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return null;
  return digits.length > 9 ? digits.slice(-9) : digits;
}
