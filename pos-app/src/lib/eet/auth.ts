import "server-only";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { assertAdminGrant } from "./policy";
import { eetDb, requireEetBusinessId } from "./db";
import { requireManagerSession } from "./manager-session";

export async function eetActor(admin = false, options?: { managerUnlock?: boolean }) {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error("EET requires a strong AUTH_SECRET (at least 32 characters).");
  const [auth, staffSession] = await Promise.all([readAuthSession(), readStaffSession()]);
  if (!auth || !staffSession || auth.businessId !== staffSession.businessId || auth.businessId !== requireEetBusinessId()) throw new Error("Authorized business and staff login required.");
  const db = eetDb();
  const { data: staff, error } = await db.from("staff").select("id,name,role,business_id,active")
    .eq("id", staffSession.staffId).eq("business_id", auth.businessId).eq("active", true).single();
  if (error || !staff || !["admin", "cashier", "manager", "server"].includes(staff.role)) throw new Error("Staff authorization failed.");
  if (admin) {
    assertAdminGrant(staff.role, staff.id, process.env.EET_ADMIN_STAFF_IDS);
    if (!options?.managerUnlock) await requireManagerSession(auth.businessId, staff.id);
  }
  return { db, staff, businessId: auth.businessId };
}
