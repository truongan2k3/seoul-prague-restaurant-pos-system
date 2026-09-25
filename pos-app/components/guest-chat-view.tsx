"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCheck, MessageCircle, Send } from "lucide-react";
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

function formatTimeShort(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

const NEAR_BOTTOM_PX = 96;

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
  const [keyboardInset, setKeyboardInset] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // iOS/Android soft keyboard — keep composer above the keyboard without covering messages.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardInset(inset > 40 ? inset : 0);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

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
      prevMessageCountRef.current = 0;
      return;
    }
    stickToBottomRef.current = true;
    prevMessageCountRef.current = 0;
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
    if (!el || !selectedId) return;

    const openedFresh = prevMessageCountRef.current === 0 && messages.length > 0;
    const grew = messages.length > prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (openedFresh || (grew && stickToBottomRef.current)) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, selectedId]);

  const onMessagesScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance <= NEAR_BOTTOM_PX;
  };

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
  const showThread = selectedId != null;

  const sendReply = async () => {
    if (!selectedId || !draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    const text = draft.trim();
    setDraft("");
    stickToBottomRef.current = true;
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

  const openSession = (id: string) => {
    stickToBottomRef.current = true;
    setSelectedId(id);
  };

  const closeThread = () => {
    setSelectedId(null);
    setDraft("");
    setError(null);
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
      style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
    >
      {/* Mobile list header — hidden while reading a thread */}
      <div
        className={`shrink-0 border-b border-gray-200 px-3 py-2.5 dark:border-gray-800 sm:px-4 sm:py-3 ${
          showThread ? "hidden md:block" : ""
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
              <MessageCircle className="h-5 w-5 shrink-0" />
              <span className="truncate">{translate("guestChatTitle")}</span>
            </h1>
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
              {translate("guestChatHint")}
              {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
              {followUpCount > 0 ? ` · ${followUpCount} follow-up` : ""}
            </p>
          </div>
          <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
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
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs sm:px-3 sm:text-sm ${
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
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden md:flex-row">
        {/* Conversation list */}
        <aside
          className={`min-h-0 w-full shrink-0 overflow-y-auto overscroll-contain border-gray-200 dark:border-gray-800 md:w-80 md:border-r ${
            showThread ? "hidden md:block" : "block"
          }`}
        >
          {loading ? (
            <p className="p-4 text-sm text-gray-500">…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">{translate("guestChatEmpty")}</p>
          ) : (
            filtered.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => openSession(row.id)}
                className={`block w-full border-b border-gray-100 px-3 py-3 text-left sm:px-4 dark:border-gray-800 ${
                  selectedId === row.id
                    ? "bg-zinc-100 dark:bg-zinc-800"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {row.guestName || row.guestEmail || `Guest · ${row.page}`}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {row.unreadByStaff ? (
                      <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Unread" />
                    ) : null}
                    <span className="text-[10px] tabular-nums text-gray-400">
                      {formatTimeShort(row.lastMessageAt)}
                    </span>
                  </div>
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                  {row.preview || "—"}
                </p>
                <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2">
                  <span
                    className={`max-w-[70%] truncate rounded-full px-2 py-0.5 text-[10px] font-medium ${statusTone(row.status)}`}
                  >
                    {guestChatStatusLabel(row.status)}
                  </span>
                  <span className="shrink-0 truncate text-[10px] capitalize text-gray-400">
                    {row.page}
                  </span>
                </div>
              </button>
            ))
          )}
        </aside>

        {/* Thread */}
        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
            showThread ? "flex" : "hidden md:flex"
          }`}
        >
          {!selected ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-500">
              {translate("guestChatSelect")}
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-start gap-2 border-b border-gray-200 px-2 py-2.5 dark:border-gray-800 sm:px-4 sm:py-3">
                <button
                  type="button"
                  onClick={closeThread}
                  aria-label={translate("guestChatBack")}
                  className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-700 md:hidden dark:border-gray-700 dark:text-gray-200"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                    {selected.guestName || selected.guestEmail || "Guest"}
                  </p>
                  <p className="mt-0.5 break-all text-xs leading-snug text-gray-500">
                    <span className="capitalize">{selected.page}</span>
                    {selected.guestEmail ? (
                      <>
                        <span className="text-gray-300 dark:text-gray-600"> · </span>
                        <span className="break-all">{selected.guestEmail}</span>
                      </>
                    ) : null}
                    {selected.guestPhone ? (
                      <>
                        <span className="text-gray-300 dark:text-gray-600"> · </span>
                        <span className="break-all">{selected.guestPhone}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {selected.status !== "resolved" && selected.status !== "closed" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void patchSession("resolve")}
                      className="rounded-lg border border-emerald-300 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800 sm:text-xs dark:border-emerald-700 dark:text-emerald-200"
                    >
                      {translate("guestChatResolve")}
                    </button>
                  ) : null}
                  {selected.status !== "closed" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void patchSession("close")}
                      className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 sm:text-xs dark:border-gray-600 dark:text-gray-200"
                    >
                      {translate("guestChatClose")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void patchSession("reopen")}
                      className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-[11px] font-medium sm:text-xs"
                    >
                      {translate("guestChatReopen")}
                    </button>
                  )}
                </div>
              </div>

              <div
                ref={listRef}
                onScroll={onMessagesScroll}
                className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4"
              >
                {messages.map((msg) => {
                  const staff = msg.sender === "staff";
                  const system = msg.sender === "system";
                  return (
                    <div key={msg.id} className={`flex ${staff ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[min(100%,22rem)] rounded-2xl px-3 py-2 text-sm sm:max-w-[80%] ${
                          system
                            ? "bg-violet-50 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100"
                            : staff
                              ? "bg-emerald-600 text-white"
                              : "bg-zinc-100 text-gray-900 dark:bg-zinc-800 dark:text-gray-100"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                          {msg.body}
                        </p>
                        <p
                          className={`mt-1 flex flex-wrap items-center gap-1 text-[10px] ${
                            staff ? "text-white/70" : "text-gray-400"
                          }`}
                        >
                          <span className="truncate">
                            {msg.staffName || (staff ? currentStaffUser?.name : "Guest")}
                          </span>
                          <span>·</span>
                          <span className="tabular-nums">{formatWhen(msg.createdAt)}</span>
                          {staff ? <CheckCheck className="h-3 w-3 shrink-0" /> : null}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {error ? (
                <p className="shrink-0 px-3 pb-1 text-sm text-red-600 sm:px-4">{error}</p>
              ) : null}

              <form
                className="flex shrink-0 items-end gap-2 border-t border-gray-200 bg-background p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-2 sm:p-3 dark:border-gray-800"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendReply();
                }}
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={busy || selected.status === "closed"}
                  placeholder={translate("guestChatReplyPlaceholder")}
                  rows={1}
                  enterKeyHint="send"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendReply();
                    }
                  }}
                  className="max-h-28 min-h-[44px] flex-1 resize-none overflow-y-auto rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-base leading-snug dark:border-gray-700 dark:bg-gray-900 sm:text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || !draft.trim() || selected.status === "closed"}
                  aria-label={translate("guestChatSend")}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white disabled:opacity-50 sm:h-auto sm:w-auto sm:gap-1 sm:px-4 sm:py-2.5 sm:text-sm sm:font-semibold"
                >
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline">{translate("guestChatSend")}</span>
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
