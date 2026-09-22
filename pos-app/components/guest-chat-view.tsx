"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, MessageCircle, Send } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import {
  guestChatStatusLabel,
  type GuestChatMessage,
  type GuestChatSession,
  type GuestChatSessionStatus,
} from "@/lib/guest-chat";
import { subscribeToGuestChatAlerts } from "@/lib/guest-chat-alert";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";

function statusTone(status: GuestChatSessionStatus): string {
  switch (status) {
    case "waiting":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "follow_up":
      return "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200";
    case "replied":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
    case "resolved":
      return "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200";
    case "closed":
      return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300";
    default:
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
  }
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** POS inbox for website Chat With Us conversations. */
export function GuestChatView() {
  const { translate, currentStaffUser } = useApp();
  const [sessions, setSessions] = useState<GuestChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<GuestChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "follow_up" | "all">("open");
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const loadSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/staff/sessions");
      const payload = (await response.json()) as { sessions?: GuestChatSession[]; error?: string };
      if (!response.ok) {
        setError(payload.error || "Failed to load chats.");
        return;
      }
      setSessions(payload.sessions ?? []);
      setError(null);
    } catch {
      setError("Failed to load chats.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (sessionId: string) => {
    const response = await fetch(
      `/api/chat/staff/messages?sessionId=${encodeURIComponent(sessionId)}`,
    );
    const payload = (await response.json()) as { messages?: GuestChatMessage[] };
    if (response.ok && payload.messages) {
      setMessages(payload.messages);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    return subscribeToGuestChatAlerts(() => {
      void loadSessions();
      const id = selectedIdRef.current;
      if (id) void loadMessages(id);
    });
  }, [loadSessions, loadMessages]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
    void fetch("/api/chat/staff/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: selectedId, action: "mark_read" }),
    }).then(() => loadSessions());

    return subscribeToPostgresRowChanges(
      `pos-guest-chat-${selectedId}`,
      {
        event: "INSERT",
        schema: "public",
        table: "guest_chat_messages",
        filter: `session_id=eq.${selectedId}`,
      },
      () => {
        void loadMessages(selectedId);
        void loadSessions();
      },
      { debounceMs: 150 },
    );
  }, [selectedId, loadMessages, loadSessions]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, selectedId]);

  const filtered = useMemo(() => {
    if (filter === "all") return sessions;
    if (filter === "follow_up") return sessions.filter((s) => s.status === "follow_up");
    return sessions.filter((s) =>
      ["open", "waiting", "replied", "follow_up"].includes(s.status),
    );
  }, [sessions, filter]);

  const selected = sessions.find((s) => s.id === selectedId) ?? null;
  const unreadCount = sessions.filter((s) => s.unreadByStaff).length;
  const followUpCount = sessions.filter((s) => s.status === "follow_up").length;

  const sendReply = async () => {
    if (!selectedId || !draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    const text = draft.trim();
    setDraft("");
    try {
      const response = await fetch("/api/chat/staff/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedId, body: text }),
      });
      const payload = (await response.json()) as {
        message?: GuestChatMessage;
        session?: GuestChatSession;
        error?: string;
      };
      if (!response.ok || !payload.message) {
        setError(payload.error || "Failed to send.");
        setDraft(text);
        return;
      }
      setMessages((prev) =>
        prev.some((m) => m.id === payload.message!.id) ? prev : [...prev, payload.message!],
      );
      void loadSessions();
    } catch {
      setError("Failed to send.");
      setDraft(text);
    } finally {
      setBusy(false);
    }
  };

  const patchSession = async (action: "resolve" | "close" | "reopen") => {
    if (!selectedId || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/chat/staff/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: selectedId, action }),
      });
      if (response.ok) await loadSessions();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            <MessageCircle className="h-5 w-5" />
            {translate("guestChatTitle")}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {translate("guestChatHint")}
            {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
            {followUpCount > 0 ? ` · ${followUpCount} follow-up` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {(
            [
              ["open", translate("guestChatFilterOpen")],
              ["follow_up", translate("guestChatFilterFollowUp")],
              ["all", translate("guestChatFilterAll")],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                filter === id
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "border border-gray-200 text-gray-700 dark:border-gray-700 dark:text-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="max-h-[40vh] w-full shrink-0 overflow-y-auto border-b border-gray-200 md:max-h-none md:w-80 md:border-b-0 md:border-r dark:border-gray-800">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">{translate("guestChatEmpty")}</p>
          ) : (
            filtered.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={`block w-full border-b border-gray-100 px-4 py-3 text-left dark:border-gray-800 ${
                  selectedId === row.id
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {row.guestName || row.guestEmail || `Guest · ${row.page}`}
                  </span>
                  {row.unreadByStaff ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  {row.preview || "—"}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusTone(row.status)}`}>
                    {guestChatStatusLabel(row.status)}
                  </span>
                  <span className="text-[10px] text-gray-400">{formatWhen(row.lastMessageAt)}</span>
                </div>
              </button>
            ))
          )}
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-8 text-sm text-gray-500">
              {translate("guestChatSelect")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {selected.guestName || selected.guestEmail || "Guest"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selected.page}
                    {selected.guestEmail ? ` · ${selected.guestEmail}` : ""}
                    {selected.guestPhone ? ` · ${selected.guestPhone}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.status !== "resolved" && selected.status !== "closed" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void patchSession("resolve")}
                      className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:border-emerald-700 dark:text-emerald-200"
                    >
                      {translate("guestChatResolve")}
                    </button>
                  ) : null}
                  {selected.status !== "closed" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void patchSession("close")}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
                    >
                      {translate("guestChatClose")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void patchSession("reopen")}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium"
                    >
                      {translate("guestChatReopen")}
                    </button>
                  )}
                </div>
              </div>

              <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((msg) => {
                  const staff = msg.sender === "staff";
                  const system = msg.sender === "system";
                  return (
                    <div key={msg.id} className={`flex ${staff ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          system
                            ? "bg-violet-50 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100"
                            : staff
                              ? "bg-emerald-600 text-white"
                              : "bg-zinc-100 text-gray-900 dark:bg-zinc-800 dark:text-gray-100"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                        <p
                          className={`mt-1 flex items-center gap-1 text-[10px] ${
                            staff ? "text-white/70" : "text-gray-400"
                          }`}
                        >
                          {msg.staffName || (staff ? currentStaffUser?.name : "Guest")} ·{" "}
                          {formatWhen(msg.createdAt)}
                          {staff ? <CheckCheck className="h-3 w-3" /> : null}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {error ? <p className="px-4 text-sm text-red-600">{error}</p> : null}

              <form
                className="flex gap-2 border-t border-gray-200 p-3 dark:border-gray-800"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendReply();
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={busy || selected.status === "closed"}
                  placeholder={translate("guestChatReplyPlaceholder")}
                  className="min-h-[44px] flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim() || selected.status === "closed"}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {translate("guestChatSend")}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
