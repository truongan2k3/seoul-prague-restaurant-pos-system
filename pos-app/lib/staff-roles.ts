import type { NavId, StaffMember, StaffRole } from "@/lib/types";

export const STAFF_ROLES: StaffRole[] = ["admin", "manager", "server", "kitchen", "bar"];

export const ALL_NAV_TABS: NavId[] = [
  "map",
  "order",
  "reservations",
  "history",
  "summary",
  "storage",
  "dynamicQr",
  "staff",
  "settings",
];

/** Legacy DB value `cashier` maps to admin in the UI. */
export function normalizeStaffRole(role: string): StaffRole {
  if (role === "cashier") return "admin";
  if (STAFF_ROLES.includes(role as StaffRole)) return role as StaffRole;
  return "server";
}

export function canManageStaff(role: StaffRole | undefined): boolean {
  return role === "admin" || role === "manager";
}

/** Default tabs for a role when `allowedNav` is not set. */
export function defaultNavTabsForRole(role: StaffRole | undefined): NavId[] {
  if (!role) return ["map"];
  if (role === "admin" || role === "manager") return [...ALL_NAV_TABS];
  if (role === "server") return ["map", "order", "reservations"];
  // Kitchen / bar primarily use dedicated screens; POS map is the fallback home.
  return ["map"];
}

export function parseAllowedNav(value: unknown): NavId[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const allowed = new Set<string>(ALL_NAV_TABS);
  const tabs = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry): entry is NavId => allowed.has(entry));
  return tabs.length > 0 ? tabs : undefined;
}

/** Effective tabs for a member (custom list or role defaults). */
export function effectiveNavTabs(member: StaffMember | null | undefined): NavId[] {
  if (!member) return ["map"];
  if (member.allowedNav && member.allowedNav.length > 0) {
    return member.allowedNav.filter((tab) => ALL_NAV_TABS.includes(tab));
  }
  return defaultNavTabsForRole(member.role);
}

/** Which main POS sidebar tabs the member may open. */
export function canAccessNavTab(role: StaffRole | undefined, tab: NavId): boolean {
  return defaultNavTabsForRole(role).includes(tab);
}

export function canAccessNavTabForMember(
  member: StaffMember | null | undefined,
  tab: NavId,
): boolean {
  if (!effectiveNavTabs(member).includes(tab)) return false;
  // Staff management UI still requires Admin/Manager role.
  if (tab === "staff" && !canManageStaff(member?.role)) return false;
  return true;
}

export function firstAccessibleNavTab(member: StaffMember | null | undefined): NavId {
  const tabs = effectiveNavTabs(member);
  return tabs[0] ?? "map";
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

export function countActiveAdmins(roster: StaffMember[]): number {
  return roster.filter((member) => member.active && member.role === "admin").length;
}

export type StaffDeleteBlockReason = "self" | "lastAdmin" | "accessDenied";

export function getStaffDeleteBlockReason(
  target: StaffMember,
  actor: StaffMember | null | undefined,
  roster: StaffMember[],
): StaffDeleteBlockReason | null {
  if (!canManageStaff(actor?.role)) return "accessDenied";
  if (target.id === actor?.id) return "self";
  if (target.role === "admin" && countActiveAdmins(roster) <= 1) return "lastAdmin";
  return null;
}

export function canDeleteStaffMember(
  target: StaffMember,
  actor: StaffMember | null | undefined,
  roster: StaffMember[],
): boolean {
  return getStaffDeleteBlockReason(target, actor, roster) === null;
}
