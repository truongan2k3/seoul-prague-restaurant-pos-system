/** Online self-serve max party size. Larger groups contact staff (Chat / email / phone). */
import { RESERVATION_FLOOR_TABLES } from "@/lib/reservation-floor-plan";

export const ONLINE_SELF_SERVE_MAX_PARTY = Math.max(...RESERVATION_FLOOR_TABLES.map((table) => table.capacity));

/** Sentinel party size for the guest picker larger-party option (not a real online booking size). */
export const ONLINE_LARGE_PARTY_OPTION = ONLINE_SELF_SERVE_MAX_PARTY + 1;
