import { createClient } from "@supabase/supabase-js";

function normalizeSupabaseUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
}

const supabaseUrl = normalizeSupabaseUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Placeholder allows `next build` without local env; runtime calls still need real credentials. */
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "public-anon-key",
);
