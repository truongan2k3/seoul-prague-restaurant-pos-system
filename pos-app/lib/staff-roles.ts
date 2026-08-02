import type { NavId, StaffRole } from "@/lib/types";

export const STAFF_ROLES: StaffRole[] = ["admin", "manager", "server", "kitchen", "bar"];

/** Legacy DB value `cashier` maps to admin in the UI. */
export function normalizeStaffRole(role: string): StaffRole {
  if (role === "cashier") return "admin";
  if (STAFF_ROLES.includes(role as StaffRole)) return role as StaffRole;
  return "server";
}

export function canManageStaff(role: StaffRole | undefined): boolean {
  return role === "admin" || role === "manager";
}

/** Which main POS sidebar tabs the logged-in role may open. */
export function canAccessNavTab(role: StaffRole | undefined, tab: NavId): boolean {
  if (!role) return tab === "map";
  if (role === "admin" || role === "manager") return true;
  if (tab === "staff" || tab === "history") return false;
  if (tab === "map" || tab === "order" || tab === "reservations") return role === "server";
  return false;
}

/** Route-level access for dedicated screens (Map, KDS, Bar, Server tablet). */
export function canAccessRoute(
  role: StaffRole | undefined,
  route: "map" | "kds" | "bar" | "server",
): boolean {
  if (!role) return route === "map";
  if (role === "admin" || role === "manager") return true;
  if (route === "kds") return role === "kitchen";
  if (route === "bar") return role === "bar";
  if (route === "server" || route === "map") return role === "server";
  return false;
}

export function canVoidOrderItems(role: StaffRole | undefined): boolean {
  return role === "admin" || role === "manager";
}

export function roleRequiresPin(role: StaffRole): boolean {
  return role === "admin" || role === "manager";
}
