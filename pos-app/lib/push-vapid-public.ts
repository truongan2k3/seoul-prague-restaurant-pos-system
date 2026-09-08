/**
 * Default VAPID public key (safe to expose in the browser).
 * Override with NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 * Pair with server env VAPID_PRIVATE_KEY (never commit the private key).
 */
export const DEFAULT_VAPID_PUBLIC_KEY =
  "BKhVDedYOsTXbb-mfmoi8aWYOol6NUkTLP3iXIyj9babw6VEo0bZ11vgJuGaHGNndbTTwN85irAtpmJ33ukgAvQ";

export function getVapidPublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
    DEFAULT_VAPID_PUBLIC_KEY
  );
}
