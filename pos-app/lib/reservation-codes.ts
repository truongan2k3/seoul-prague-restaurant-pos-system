const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Short public reference shown to guests and staff, e.g. SP-A7K2 */
export function generateBookingCode(): string {
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `SP-${suffix}`;
}

/** Long secret for manage URL — never show in staff list or emails as bare token alone. */
export function generateManageToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
