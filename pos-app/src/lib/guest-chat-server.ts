import {
  DEFAULT_GUEST_CHAT_CONFIG,
  parseGuestChatConfig,
  type GuestChatConfig,
  type GuestChatMessage,
  type GuestChatPage,
  type GuestChatSession,
  type GuestChatSessionStatus,
  type GuestChatSender,
} from "@/lib/guest-chat";
import { broadcastGuestChatAlert } from "@/src/lib/guest-chat-alert-server";
import { createSupabaseAdmin } from "@/src/lib/supabase-admin";

type SessionRow = {
  id: string;
  guest_client_id: string;
  page: GuestChatPage;
  status: GuestChatSessionStatus;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  last_message_at: string;
  last_guest_message_at: string | null;
  last_staff_message_at: string | null;
  unread_by_staff: boolean;
  follow_up_offered_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  session_id: string;
  sender: GuestChatSender;
  body: string;
  staff_id: string | null;
  staff_name: string | null;
  created_at: string;
};

function mapSession(row: SessionRow, preview?: string): GuestChatSession {
  return {
    id: row.id,
    guestClientId: row.guest_client_id,
    page: row.page,
    status: row.status,
    guestName: row.guest_name ?? undefined,
    guestEmail: row.guest_email ?? undefined,
    guestPhone: row.guest_phone ?? undefined,
    lastMessageAt: row.last_message_at,
    lastGuestMessageAt: row.last_guest_message_at,
    lastStaffMessageAt: row.last_staff_message_at,
    unreadByStaff: row.unread_by_staff,
    followUpOfferedAt: row.follow_up_offered_at,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preview,
  };
}

function mapMessage(row: MessageRow): GuestChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    sender: row.sender,
    body: row.body,
    staffId: row.staff_id,
    staffName: row.staff_name,
    createdAt: row.created_at,
  };
}

export async function fetchGuestChatConfigServer(): Promise<GuestChatConfig> {
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("settings").select("guest_chat_config").limit(1).maybeSingle();
  return parseGuestChatConfig(
    (data as { guest_chat_config?: unknown } | null)?.guest_chat_config,
  );
}

async function archiveStaleSessions(config: GuestChatConfig): Promise<void> {
  const admin = createSupabaseAdmin();
  const cutoff = new Date(Date.now() - config.autoArchiveHours * 60 * 60 * 1000).toISOString();
  await admin
    .from("guest_chat_sessions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("status", ["open", "waiting", "replied", "follow_up", "resolved"])
    .lt("last_message_at", cutoff);
}

export async function openOrResumeGuestChatSession(input: {
  guestClientId: string;
  page: GuestChatPage;
  sessionId?: string | null;
}): Promise<{ session: GuestChatSession; messages: GuestChatMessage[]; config: GuestChatConfig; error: string | null }> {
  const guestClientId = input.guestClientId.trim();
  if (!guestClientId) {
    return {
      session: null as unknown as GuestChatSession,
      messages: [],
      config: DEFAULT_GUEST_CHAT_CONFIG,
      error: "Missing guest client id.",
    };
  }

  const config = await fetchGuestChatConfigServer();
  void archiveStaleSessions(config);

  const admin = createSupabaseAdmin();
  let sessionRow: SessionRow | null = null;

  if (input.sessionId?.trim()) {
    const { data } = await admin
      .from("guest_chat_sessions")
      .select("*")
      .eq("id", input.sessionId.trim())
      .eq("guest_client_id", guestClientId)
      .maybeSingle();
    sessionRow = (data as SessionRow | null) ?? null;
    if (sessionRow && (sessionRow.status === "closed" || sessionRow.status === "resolved")) {
      // Reopen resolved only; closed stays closed → new session below.
      if (sessionRow.status === "resolved") {
        const { data: reopened } = await admin
          .from("guest_chat_sessions")
          .update({
            status: "open",
            resolved_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sessionRow.id)
          .select("*")
          .single();
        sessionRow = (reopened as SessionRow | null) ?? sessionRow;
      } else {
        sessionRow = null;
      }
    }
  }

  if (!sessionRow) {
    const { data: existing } = await admin
      .from("guest_chat_sessions")
      .select("*")
      .eq("guest_client_id", guestClientId)
      .in("status", ["open", "waiting", "replied", "follow_up"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    sessionRow = (existing as SessionRow | null) ?? null;
  }

  if (!sessionRow) {
    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("guest_chat_sessions")
      .insert({
        guest_client_id: guestClientId,
        page: input.page,
        status: "open",
        last_message_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error || !data) {
      return {
        session: null as unknown as GuestChatSession,
        messages: [],
        config,
        error: error?.message ?? "Failed to create chat session.",
      };
    }
    sessionRow = data as SessionRow;

    if (config.welcomeMessage.trim()) {
      await admin.from("guest_chat_messages").insert({
        session_id: sessionRow.id,
        sender: "system",
        body: config.welcomeMessage.trim(),
      });
    }
  }

  const messages = await listMessagesForSession(sessionRow.id);
  return { session: mapSession(sessionRow), messages, config, error: null };
}

export async function listMessagesForSession(sessionId: string): Promise<GuestChatMessage[]> {
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("guest_chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(500);
  return ((data as MessageRow[] | null) ?? []).map(mapMessage);
}

export async function postGuestChatMessage(input: {
  guestClientId: string;
  sessionId: string;
  body: string;
}): Promise<{ message: GuestChatMessage | null; session: GuestChatSession | null; error: string | null }> {
  const body = input.body.trim();
  if (!body) return { message: null, session: null, error: "Message is empty." };
  if (body.length > 2000) return { message: null, session: null, error: "Message is too long." };

  const admin = createSupabaseAdmin();
  const { data: sessionData, error: sessionError } = await admin
    .from("guest_chat_sessions")
    .select("*")
    .eq("id", input.sessionId)
    .eq("guest_client_id", input.guestClientId.trim())
    .maybeSingle();

  if (sessionError || !sessionData) {
    return { message: null, session: null, error: "Chat session not found." };
  }

  let session = sessionData as SessionRow;
  if (session.status === "closed") {
    return { message: null, session: mapSession(session), error: "This chat was closed." };
  }

  const now = new Date().toISOString();
  const { data: msg, error: msgError } = await admin
    .from("guest_chat_messages")
    .insert({
      session_id: session.id,
      sender: "guest",
      body,
    })
    .select("*")
    .single();

  if (msgError || !msg) {
    return { message: null, session: null, error: msgError?.message ?? "Failed to send." };
  }

  const nextStatus: GuestChatSessionStatus =
    session.status === "follow_up" ? "follow_up" : "waiting";

  const { data: updated } = await admin
    .from("guest_chat_sessions")
    .update({
      status: nextStatus,
      last_message_at: now,
      last_guest_message_at: now,
      unread_by_staff: true,
      updated_at: now,
      resolved_at: null,
      closed_at: null,
    })
    .eq("id", session.id)
    .select("*")
    .single();

  session = (updated as SessionRow | null) ?? { ...session, status: nextStatus, unread_by_staff: true };

  void broadcastGuestChatAlert({
    kind: "new_message",
    sessionId: session.id,
    preview: body.slice(0, 120),
    guestClientId: session.guest_client_id,
    status: session.status,
    unreadByStaff: true,
  });

  return { message: mapMessage(msg as MessageRow), session: mapSession(session, body.slice(0, 120)), error: null };
}

export async function submitGuestChatFollowUp(input: {
  guestClientId: string;
  sessionId: string;
  email: string;
  phone?: string;
  name?: string;
}): Promise<{ session: GuestChatSession | null; error: string | null }> {
  const email = input.email.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { session: null, error: "Please enter a valid email." };
  }

  const admin = createSupabaseAdmin();
  const { data: sessionData } = await admin
    .from("guest_chat_sessions")
    .select("*")
    .eq("id", input.sessionId)
    .eq("guest_client_id", input.guestClientId.trim())
    .maybeSingle();

  if (!sessionData) return { session: null, error: "Chat session not found." };
  const session = sessionData as SessionRow;
  const now = new Date().toISOString();
  const phone = input.phone?.trim() || null;
  const name = input.name?.trim() || null;

  await admin.from("guest_chat_messages").insert({
    session_id: session.id,
    sender: "system",
    body: `Contact request saved: ${email}${phone ? ` · ${phone}` : ""}`,
  });

  const { data: updated, error } = await admin
    .from("guest_chat_sessions")
    .update({
      status: "follow_up",
      guest_email: email,
      guest_phone: phone,
      guest_name: name ?? session.guest_name,
      follow_up_offered_at: session.follow_up_offered_at ?? now,
      unread_by_staff: true,
      last_message_at: now,
      updated_at: now,
    })
    .eq("id", session.id)
    .select("*")
    .single();

  if (error || !updated) {
    return { session: null, error: error?.message ?? "Failed to save contact." };
  }

  void broadcastGuestChatAlert({
    kind: "follow_up",
    sessionId: session.id,
    preview: `Follow-up: ${email}`,
    status: "follow_up",
    unreadByStaff: true,
  });

  return { session: mapSession(updated as SessionRow), error: null };
}

export async function markFollowUpOffered(sessionId: string): Promise<void> {
  const admin = createSupabaseAdmin();
  await admin
    .from("guest_chat_sessions")
    .update({
      follow_up_offered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .is("follow_up_offered_at", null);
}

export async function listStaffChatSessions(): Promise<GuestChatSession[]> {
  const config = await fetchGuestChatConfigServer();
  void archiveStaleSessions(config);

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("guest_chat_sessions")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(100);

  const sessions = ((data as SessionRow[] | null) ?? []).map((row) => mapSession(row));

  // Attach last message preview
  const ids = sessions.map((s) => s.id);
  if (ids.length === 0) return sessions;

  const { data: msgs } = await admin
    .from("guest_chat_messages")
    .select("session_id, body, created_at")
    .in("session_id", ids)
    .order("created_at", { ascending: false })
    .limit(200);

  const previewBySession = new Map<string, string>();
  for (const row of (msgs as { session_id: string; body: string }[] | null) ?? []) {
    if (!previewBySession.has(row.session_id)) {
      previewBySession.set(row.session_id, row.body.slice(0, 120));
    }
  }

  return sessions.map((s) => ({ ...s, preview: previewBySession.get(s.id) }));
}

export async function postStaffChatReply(input: {
  sessionId: string;
  body: string;
  staffId?: string | null;
  staffName?: string | null;
}): Promise<{ message: GuestChatMessage | null; session: GuestChatSession | null; error: string | null }> {
  const body = input.body.trim();
  if (!body) return { message: null, session: null, error: "Message is empty." };

  const admin = createSupabaseAdmin();
  const { data: sessionData } = await admin
    .from("guest_chat_sessions")
    .select("*")
    .eq("id", input.sessionId)
    .maybeSingle();

  if (!sessionData) return { message: null, session: null, error: "Session not found." };
  const session = sessionData as SessionRow;
  if (session.status === "closed") {
    return { message: null, session: mapSession(session), error: "Session is closed." };
  }

  const now = new Date().toISOString();
  const { data: msg, error: msgError } = await admin
    .from("guest_chat_messages")
    .insert({
      session_id: session.id,
      sender: "staff",
      body,
      staff_id: input.staffId ?? null,
      staff_name: input.staffName ?? null,
    })
    .select("*")
    .single();

  if (msgError || !msg) {
    return { message: null, session: null, error: msgError?.message ?? "Failed to reply." };
  }

  const { data: updated } = await admin
    .from("guest_chat_sessions")
    .update({
      status: "replied",
      last_message_at: now,
      last_staff_message_at: now,
      unread_by_staff: false,
      updated_at: now,
    })
    .eq("id", session.id)
    .select("*")
    .single();

  void broadcastGuestChatAlert({
    kind: "session_updated",
    sessionId: session.id,
    preview: body.slice(0, 120),
    status: "replied",
    unreadByStaff: false,
  });

  return {
    message: mapMessage(msg as MessageRow),
    session: mapSession((updated as SessionRow | null) ?? { ...session, status: "replied" }),
    error: null,
  };
}

export async function updateStaffChatSession(input: {
  sessionId: string;
  action: "mark_read" | "resolve" | "close" | "reopen";
}): Promise<{ session: GuestChatSession | null; error: string | null }> {
  const admin = createSupabaseAdmin();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };

  if (input.action === "mark_read") {
    patch.unread_by_staff = false;
  } else if (input.action === "resolve") {
    patch.status = "resolved";
    patch.resolved_at = now;
    patch.unread_by_staff = false;
  } else if (input.action === "close") {
    patch.status = "closed";
    patch.closed_at = now;
    patch.unread_by_staff = false;
  } else if (input.action === "reopen") {
    patch.status = "open";
    patch.resolved_at = null;
    patch.closed_at = null;
  }

  const { data, error } = await admin
    .from("guest_chat_sessions")
    .update(patch)
    .eq("id", input.sessionId)
    .select("*")
    .single();

  if (error || !data) {
    return { session: null, error: error?.message ?? "Update failed." };
  }

  void broadcastGuestChatAlert({
    kind: "session_updated",
    sessionId: input.sessionId,
    status: (data as SessionRow).status,
    unreadByStaff: (data as SessionRow).unread_by_staff,
  });

  return { session: mapSession(data as SessionRow), error: null };
}
