export interface EetSetupIssue { code: string; title: string; action: string }

// Only static, allowlisted descriptions reach the browser. Never display arbitrary
// exception messages: SDK/network errors may contain credentials or query details.
const issues: Record<string, EetSetupIssue> = {
  "EET preparation could not be loaded.": {
    code: "EET_PREPARATION_STORAGE", title: "Saved EET preparation could not be read.", action: "Recheck the server connection to the existing EET audit table. This workflow uses the installed EET schema; no additional migration or encryption-key change is required.",
  },
  "Enter the manager code to unlock EET settings.": {
    code: "EET_MANAGER_LOCKED", title: "Manager access is locked or expired.", action: "Open POS Settings → EET Integration and enter the manager code again. The server requires a new authorization after 10 minutes or a staff/code change.",
  },
  "Configure a manager code in POS Settings → Security before unlocking EET.": {
    code: "EET_MANAGER_CODE", title: "A configured manager code could not be loaded.", action: "Configure your existing manager code in POS Settings → Security. Check this deployment's settings table connection. EET never falls back to a default code.",
  },
  "EET requires a strong AUTH_SECRET (at least 32 characters).": {
    code: "EET_AUTH_SECRET", title: "The server authentication secret is missing or too short.",
    action: "Check AUTH_SECRET on this Vercel deployment (at least 32 characters), then redeploy. Preserve the existing working secret; if it was changed, sign in again.",
  },
  "EET requires a server-only Supabase service role key.": {
    code: "EET_DATABASE_KEY", title: "The server database key is unavailable on this deployment.",
    action: "Check SUPABASE_SERVICE_ROLE_KEY in the environment used by this deployment, then redeploy. Do not use the public anonymous key.",
  },
  "Supabase env vars are not configured.": {
    code: "EET_DATABASE_CONFIG", title: "The Supabase connection is not configured.",
    action: "Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY belong to the same project, then redeploy.",
  },
  "Configure EET_BUSINESS_ID for this POS deployment.": {
    code: "EET_BUSINESS_ID", title: "The EET business ID is missing or invalid.",
    action: "Use Find business/admin IDs below. Set EET_BUSINESS_ID to the business UUID for this POS, then redeploy.",
  },
  "Authorized business and staff login required.": {
    code: "EET_SESSION_BUSINESS", title: "The current login does not match the configured EET business, or its session has expired.",
    action: "Confirm EET_BUSINESS_ID matches the business you signed into, then sign out and sign in again as an authorized administrator. Do not change the encryption key.",
  },
  "Staff authorization failed.": {
    code: "EET_STAFF_LOOKUP", title: "The server could not verify the current staff account.",
    action: "Check that the staff account is active and belongs to this business. Verify the service-role key belongs to the same Supabase project as the POS, then sign in again.",
  },
  "EET administrator permission required.": {
    code: "EET_ADMIN_PERMISSION", title: "The signed-in staff account is not authorized to administer EET.",
    action: "EET_ADMIN_STAFF_IDS must contain the exact staff UUID of the admin, cashier or manager currently signed in, not the business ID or a Supabase Auth user ID. After correcting Vercel settings, redeploy and sign in again, then unlock EET with the manager code.",
  },
  "EET schema unavailable. Apply the additive migration after the database preflight.": {
    code: "EET_SETTINGS_DATABASE", title: "The server could not read the EET settings table.",
    action: "Check the EET migration was applied to the Supabase project used by this deployment and that its service-role key is correct. Run the read-only preflight below before applying any missing migration.",
  },
  "EET queue health query unavailable.": {
    code: "EET_QUEUE_HEALTH", title: "The EET queue health function is unavailable or could not be executed.",
    action: "Check eet_queue_health and its permissions in the same Supabase project. Use the read-only preflight before applying a missing EET tables/queue migration. Do not rerun installation scripts blindly.",
  },
  "EET audit query unavailable.": {
    code: "EET_AUDIT_DATABASE", title: "The server could not read the EET audit history.",
    action: "Check eet_audit_logs and the server service-role permissions in this Supabase project. Use the read-only preflight before applying a missing migration.",
  },
  "EET material status unavailable.": {
    code: "EET_MATERIAL_DATABASE", title: "The server could not read encrypted certificate storage.",
    action: "Check eet_materials and its permissions in this Supabase project. Keep your existing encryption key. Review the read-only preflight and encrypted certificate storage migration.",
  },
};

export function describeEetSetupFailure(error: unknown): EetSetupIssue {
  const message = error instanceof Error ? error.message : "";
  if (Object.hasOwn(issues, message)) return { ...issues[message] };
  return {
    code: "EET_SETUP_UNAVAILABLE", title: "The EET settings check could not finish.",
    action: "Reload this page. If it persists, inspect the server connection and deployment logs privately. Do not share keys, certificates or raw logs, and do not replace your encryption key or rerun database installation without checking the cause.",
  };
}
