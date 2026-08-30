"use server";

import { hashPassword } from "@/src/lib/auth/password";
import {
  STATUS_ADMIN_USERNAME,
  getStatusAdminPassword,
} from "@/src/lib/auth/status-admin-token";
import {
  clearStatusAdminSession,
  readStatusAdminSession,
  writeStatusAdminSession,
} from "@/src/lib/auth/status-admin-session";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";
import type { PageTarget } from "@/lib/page-routes";
import { PAGE_TARGETS } from "@/lib/page-routes";

export async function getStatusAdminSessionAction() {
  return readStatusAdminSession();
}

export async function statusAdminLoginAction(username: string, password: string) {
  const trimmedUser = username.trim().toLowerCase();
  const trimmedPass = password;

  if (trimmedUser !== STATUS_ADMIN_USERNAME || trimmedPass !== getStatusAdminPassword()) {
    return { ok: false as const, error: "invalidCredentials" };
  }

  await writeStatusAdminSession({
    username: STATUS_ADMIN_USERNAME,
    authenticatedAt: new Date().toISOString(),
  });

  return { ok: true as const };
}

export async function statusAdminLogoutAction() {
  await clearStatusAdminSession();
  return { ok: true as const };
}

async function requireStatusAdmin() {
  const session = await readStatusAdminSession();
  if (!session) throw new Error("unauthorized");
  return session;
}

export async function changeBusinessOwnerPasswordAction(newPassword: string) {
  await requireStatusAdmin();

  const trimmed = newPassword.trim();
  if (trimmed.length < 1) {
    return { ok: false as const, error: "passwordTooShort" };
  }

  const supabase = createSupabaseAdmin();
  const { data: account, error: lookupError } = await supabase
    .from("business_accounts")
    .select("id, username")
    .eq("role", "owner")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (lookupError || !account) {
    return { ok: false as const, error: "accountNotFound" };
  }

  const { hash, salt } = hashPassword(trimmed);
  const { error } = await supabase
    .from("business_accounts")
    .update({ password_hash: hash, password_salt: salt })
    .eq("id", account.id);

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const, username: account.username as string };
}

export async function getBusinessOwnerInfoAction() {
  await requireStatusAdmin();

  const supabase = createSupabaseAdmin();
  const { data: account } = await supabase
    .from("business_accounts")
    .select("id, username, business_id")
    .eq("role", "owner")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!account) {
    return { ok: false as const, error: "accountNotFound" };
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("name, slug")
    .eq("id", account.business_id)
    .maybeSingle();

  return {
    ok: true as const,
    username: account.username as string,
    businessName: (business?.name as string | undefined) ?? "—",
  };
}

export type AdminPopupBroadcastPayload = {
  title: string;
  message: string;
  targets: PageTarget[];
  at: string;
};

export type AdminRefreshBroadcastPayload = {
  targets: PageTarget[];
  at: string;
};

async function broadcastAdminEvent(event: "admin_popup" | "admin_refresh", payload: unknown) {
  const supabase = createSupabaseAdmin();
  const channel = supabase.channel("pos_admin_broadcast", {
    config: { broadcast: { self: true } },
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime subscribe timeout")), 5000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(`Realtime ${status}`));
      }
    });
  });

  await channel.send({
    type: "broadcast",
    event,
    payload,
  });

  void supabase.removeChannel(channel);
}

export async function sendAdminPopupAction(input: {
  title: string;
  message: string;
  targets: PageTarget[];
}) {
  await requireStatusAdmin();

  const title = input.title.trim();
  const message = input.message.trim();
  const targets = input.targets.filter((target) => PAGE_TARGETS.includes(target));

  if (!title && !message) {
    return { ok: false as const, error: "emptyMessage" };
  }
  if (targets.length === 0) {
    return { ok: false as const, error: "noTargets" };
  }

  const payload: AdminPopupBroadcastPayload = {
    title: title || "Thông báo",
    message,
    targets,
    at: new Date().toISOString(),
  };

  try {
    await broadcastAdminEvent("admin_popup", payload);
  } catch {
    return { ok: false as const, error: "broadcastFailed" };
  }

  return { ok: true as const, payload };
}

export async function sendAdminRefreshAction(input: { targets: PageTarget[] }) {
  await requireStatusAdmin();

  const targets = input.targets.filter((target) => PAGE_TARGETS.includes(target));
  if (targets.length === 0) {
    return { ok: false as const, error: "noTargets" };
  }

  const payload: AdminRefreshBroadcastPayload = {
    targets,
    at: new Date().toISOString(),
  };

  try {
    await broadcastAdminEvent("admin_refresh", payload);
  } catch {
    return { ok: false as const, error: "broadcastFailed" };
  }

  return { ok: true as const, payload };
}
