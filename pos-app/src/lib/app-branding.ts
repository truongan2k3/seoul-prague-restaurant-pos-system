import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

/** Branding is public; never accept an arbitrary image URL from a request. */
export async function readPublicAppBranding(businessId: string | null) {
  if (!businessId || !/^[0-9a-f-]{36}$/i.test(businessId)) return null;
  try {
    const { data, error } = await createSupabaseAdmin().from("businesses")
      .select("id, name, logo_url").eq("id", businessId).maybeSingle();
    if (error || !data) return null;
    return { id: data.id as string, name: data.name as string, logoUrl: (data.logo_url ?? "") as string };
  } catch {
    return null;
  }
}

export function isBusinessLogoUrl(logoUrl: string, businessId: string) {
  try {
    const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    const logo = new URL(logoUrl);
    return logo.origin === storage.origin &&
      logo.pathname.startsWith(`/storage/v1/object/public/business_branding/${businessId}/`);
  } catch {
    return false;
  }
}
