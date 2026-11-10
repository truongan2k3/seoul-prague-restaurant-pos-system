import "server-only";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

export function eetDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("EET requires a server-only Supabase service role key.");
  return createSupabaseAdmin();
}

export function requireEetBusinessId() {
  const id = process.env.EET_BUSINESS_ID;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Configure EET_BUSINESS_ID for this POS deployment.");
  return id;
}
