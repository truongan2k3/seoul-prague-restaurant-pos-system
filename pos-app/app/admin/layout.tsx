export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";
import { WebsiteAdminShell } from "@/components/admin/website/admin-shell";
import { readAuthSession } from "@/src/lib/auth/session";
import { readStaffSession } from "@/src/lib/auth/staff-session";
import { canManageStaff, normalizeStaffRole } from "@/lib/staff-roles";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const businessSession = await readAuthSession();
  const staffSession = await readStaffSession();

  if (!businessSession) {
    redirect("/login?next=/admin");
  }
  if (!staffSession || !canManageStaff(normalizeStaffRole(staffSession.staffRole))) {
    redirect("/staff-login?next=/admin");
  }

  return <WebsiteAdminShell>{children}</WebsiteAdminShell>;
}
