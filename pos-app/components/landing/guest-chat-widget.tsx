"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import {
  clearStoredSessionId,
  guestChatStatusLabel,
  isActiveGuestChatStatus,
  readGuestClientId,
  readStoredSessionId,
  storeSessionId,
  type GuestChatConfig,
  type GuestChatMessage,
  type GuestChatPage,
  type GuestChatSession,
} from "@/lib/guest-chat";
import { subscribeToPostgresRowChanges } from "@/lib/realtime-subscribe";

type Props = {
  page: GuestChatPage;
};

type PanelStatus = "online" | "waiting" | "replied" | "offline" | "closed";

function statusFromSession(session: GuestChatSession | null, online: boolean): PanelStatus {
  if (!online) return "offline";
  if (!session) return "online";
  if (session.status === "closed" || session.status === "resolved") return "closed";
  if (session.status === "waiting") return "waiting";
  if (session.status === "replied") return "replied";
  return "online";
}

function statusDotClass(status: PanelStatus): string {
  if (status === "waiting") return "bg-amber-400";
  if (status === "replied") return "bg-emerald-400";
  if (status === "offline" || status === "closed") return "bg-white/40";
  return "bg-emerald-400";
}

function statusText(status: PanelStatus): string {
  if (status === "waiting") return "Waiting for reply";
  if (status === "replied") return "Replied";
  if (status === "offline") return "Away";
  if (status === "closed") return "Closed";
  return "Online";
}

/**
 * Floating Chat With Us on landing / reservation pages.
 * Start screen collects guest name; closed chats can reopen via “I still need help”.
 */
export function GuestChatWidget({ page }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<GuestChatConfig | null>(null);
  const [session, setSession] = useState<GuestChatSession | null>(null);
  const [messages, setMessages] = useState<GuestChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [guestName, setGuestName] = useState("");
  const [phase, setPhase] = useState<"booting" | "start" | "chat">("booting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followEmail, setFollowEmail] = useState("");
  const [followPhone, setFollowPhone] = useState("");
  const [followSaved, setFollowSaved] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const followTimerRef = useRef<number | null>(null);
  const bootingRef = useRef(false);

  const online = true;
  const panelStatus = statusFromSession(session, online && enabled);
  const chatClosed =
    session != null && (session.status === "closed" || session.status === "resolved");
  const canSend = session != null && isActiveGuestChatStatus(session.status) && !busy;

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/chat/config")
      .then((r) => r.json())
      .then((payload: { config?: GuestChatConfig }) => {
        if (cancelled || !payload.config) return;
        setConfig(payload.config);
        setEnabled(Boolean(payload.config.enabled));
      })
      .catch(() => {
        /* widget stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, open, phase, scrollToBottom]);

  const applySessionPayload = useCallback(
    (payload: {
      session?: GuestChatSession | null;
      messages?: GuestChatMessage[];
      config?: GuestChatConfig;
    }) => {
      if (payload.config) {
        setConfig(payload.config);
        setEnabled(Boolean(payload.config.enabled));
      }
      if (payload.session) {
        storeSessionId(payload.session.id);
        setSession(payload.session);
        setMessages(payload.messages ?? []);
        if (payload.session.guestName) setGuestName(payload.session.guestName);
        if (payload.session.guestEmail) setFollowSaved(true);
        setPhase("chat");
      } else {
        setSession(null);
        setMessages([]);
        setPhase("start");
      }
    },
    [],
  );

  const resumeSession = useCallback(async () => {
    if (bootingRef.current) return;
    bootingRef.current = true;
    setError(null);
    setPhase("booting");
    try {
      const guestClientId = readGuestClientId();
      const storedSessionId = readStoredSessionId();
      const response = await fetch("/api/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestClientId,
          page,
          sessionId: storedSessionId,
          action: "resume",
        }),
      });
      const payload = (await response.json()) as {
        session?: GuestChatSession | null;
        messages?: GuestChatMessage[];
        config?: GuestChatConfig;
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error || "Could not open chat.");
        setPhase("start");
        return;
      }
      applySessionPayload(payload);
    } catch {
      setError("Could not open chat.");
      setPhase("start");
    } finally {
      bootingRef.current = false;
    }
  }, [page, applySessionPayload]);

  useEffect(() => {
    if (!open || !enabled) return;
    void resumeSession();
  }, [open, enabled, resumeSession]);

  // Realtime messages + session status (close from staff).
  useEffect(() => {
    if (!open || !session?.id || phase !== "chat") return;
    const sessionId = session.id;
    const guestClientId = readGuestClientId();

    const refreshMessages = () => {
      void fetch(
        `/api/chat/messages?sessionId=${encodeURIComponent(sessionId)}&guestClientId=${encodeURIComponent(guestClientId)}`,
      )
        .then((r) => r.json())
        .then((payload: { messages?: GuestChatMessage[] }) => {
          if (payload.messages) setMessages(payload.messages);
        })
        .catch(() => {
          /* ignore */
        });
    };

    const unsubMessages = subscribeToPostgresRowChanges(
      `guest-chat-msg-${sessionId}`,
      {
        event: "INSERT",
        schema: "public",
        table: "guest_chat_messages",
        filter: `session_id=eq.${sessionId}`,
      },
      refreshMessages,
      { debounceMs: 200 },
    );

    const unsubSession = subscribeToPostgresRowChanges(
      `guest-chat-session-${sessionId}`,
      {
        event: "UPDATE",
        schema: "public",
        table: "guest_chat_sessions",
        filter: `id=eq.${sessionId}`,
      },
      () => {
        void fetch("/api/chat/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestClientId,
            page,
            sessionId,
            action: "resume",
          }),
        })
          .then((r) => r.json())
          .then(
            (payload: {
              session?: GuestChatSession | null;
              messages?: GuestChatMessage[];
            }) => {
              if (payload.session) {
                setSession(payload.session);
                if (payload.messages) setMessages(payload.messages);
              }
            },
          )
          .catch(() => {
            /* ignore */
          });
      },
      { debounceMs: 200 },
    );

    return () => {
      unsubMessages();
      unsubSession();
    };
  }, [open, session?.id, phase, page]);

  useEffect(() => {
    if (followTimerRef.current != null) {
      window.clearTimeout(followTimerRef.current);
      followTimerRef.current = null;
    }
    if (!open || !session || !config || followSaved || showFollowUp || chatClosed) return;
    if (session.followUpOfferedAt || session.guestEmail) return;
    if (session.status !== "waiting") return;
    if (!session.lastGuestMessageAt) return;

    const elapsed = Date.now() - new Date(session.lastGuestMessageAt).getTime();
    const waitMs = Math.max(0, config.unansweredMinutes * 60_000 - elapsed);

    followTimerRef.current = window.setTimeout(() => {
      setShowFollowUp(true);
      const guestClientId = readGuestClientId();
      void fetch("/api/chat/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestClientId,
          sessionId: session.id,
          offeredOnly: true,
        }),
      });
    }, waitMs);

    return () => {
      if (followTimerRef.current != null) {
        window.clearTimeout(followTimerRef.current);
        followTimerRef.current = null;
      }
    };
  }, [open, session, config, followSaved, showFollowUp, chatClosed]);

  const startChat = async () => {
    const name = guestName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestClientId: readGuestClientId(),
          page,
          sessionId: readStoredSessionId(),
          guestName: name,
          action: "start",
        }),
      });
      const payload = (await response.json()) as {
        session?: GuestChatSession | null;
        messages?: GuestChatMessage[];
        config?: GuestChatConfig;
        error?: string;
      };
      if (!response.ok || !payload.session) {
        setError(payload.error || "Could not start chat.");
        return;
      }
      applySessionPayload(payload);
    } catch {
      setError("Could not start chat.");
    } finally {
      setBusy(false);
    }
  };

  const requestMoreHelp = async () => {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestClientId: readGuestClientId(),
          page,
          sessionId: session.id,
          action: "need_help",
        }),
      });
      const payload = (await response.json()) as {
        session?: GuestChatSession | null;
        messages?: GuestChatMessage[];
        config?: GuestChatConfig;
        error?: string;
      };
      if (!response.ok || !payload.session) {
        setError(payload.error || "Could not reopen chat.");
        return;
      }
      applySessionPayload(payload);
      setShowFollowUp(false);
    } catch {
      setError("Could not reopen chat.");
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || busy || !session || !canSend) return;
    setBusy(true);
    setError(null);
    setDraft("");
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestClientId: readGuestClientId(),
          sessionId: session.id,
          body: text,
        }),
      });
      const payload = (await response.json()) as {
        message?: GuestChatMessage;
        session?: GuestChatSession;
        error?: string;
      };
      if (!response.ok || !payload.message) {
        setError(payload.error || "Failed to send.");
        setDraft(text);
        if (payload.session) setSession(payload.session);
        return;
      }
      setMessages((prev) =>
        prev.some((m) => m.id === payload.message!.id) ? prev : [...prev, payload.message!],
      );
      if (payload.session) setSession(payload.session);
      setFollowSaved(false);
      setShowFollowUp(false);
    } catch {
      setError("Failed to send.");
      setDraft(text);
    } finally {
      setBusy(false);
    }
  };

  const submitFollowUp = async () => {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestClientId: readGuestClientId(),
          sessionId: session.id,
          email: followEmail,
          phone: followPhone || undefined,
          name: guestName.trim() || undefined,
        }),
      });
      const payload = (await response.json()) as { session?: GuestChatSession; error?: string };
      if (!response.ok || !payload.session) {
        setError(payload.error || "Could not save contact.");
        return;
      }
      setSession(payload.session);
      setFollowSaved(true);
      setShowFollowUp(false);
    } catch {
      setError("Could not save contact.");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-full border border-[#C9A88B]/40 bg-[#0B0B0C] px-4 py-3 text-sm font-medium text-[#F5EDE4] shadow-[0_12px_40px_rgba(0,0,0,0.45)] transition hover:border-[#C9A88B] hover:bg-[#141416] sm:bottom-6 sm:right-6 ${
          open ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-label="Chat with us"
      >
        <span className={`h-2 w-2 rounded-full ${statusDotClass(panelStatus)}`} />
        <MessageCircle className="h-4 w-4 text-[#C9A88B]" />
        <span className="landing-serif tracking-wide">Chat With Us</span>
      </button>

      {open ? (
        <div className="fixed inset-x-3 bottom-3 z-[95] flex justify-end sm:inset-x-auto sm:bottom-6 sm:right-6">
          <div className="flex h-[min(70dvh,560px)] w-full max-w-[400px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0B0B0C] text-[#F5EDE4] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div>
                <p className="landing-serif text-lg tracking-wide text-[#F5EDE4]">Chat With Us</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/55">
                  <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(panelStatus)}`} />
                  {session ? guestChatStatusLabel(session.status) : statusText(panelStatus)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-white/60 hover:bg-white/5 hover:text-white"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {phase === "booting" ? (
              <div className="flex flex-1 items-center justify-center px-4 text-sm text-white/50">
                Opening chat…
              </div>
            ) : null}

            {phase === "start" ? (
              <div className="flex flex-1 flex-col justify-center gap-4 px-5 py-6">
                <div>
                  <p className="landing-serif text-xl text-[#F5EDE4]">Start a conversation</p>
                  <p className="mt-1 text-sm text-white/55">
                    Enter your name so our team knows who to help.
                  </p>
                </div>
                <label className="block text-xs text-white/55">
                  Your name
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    maxLength={80}
                    autoFocus
                    className="mt-1.5 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#C9A88B]/60"
                    placeholder="e.g. Anna"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void startChat();
                      }
                    }}
                  />
                </label>
                {error ? <p className="text-xs text-red-300">{error}</p> : null}
                <button
                  type="button"
                  disabled={busy || !guestName.trim()}
                  onClick={() => void startChat()}
                  className="rounded-xl bg-[#C9A88B] px-4 py-3 text-sm font-semibold text-[#0B0B0C] disabled:opacity-40"
                >
                  Start
                </button>
              </div>
            ) : null}

            {phase === "chat" ? (
              <>
                <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
                  {messages.map((msg) => {
                    const mine = msg.sender === "guest";
                    const system = msg.sender === "system";
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                            system
                              ? "bg-white/5 text-white/70"
                              : mine
                                ? "bg-[#C9A88B] text-[#0B0B0C]"
                                : "bg-white/10 text-[#F5EDE4]"
                          }`}
                        >
                          {!mine && !system && msg.staffName ? (
                            <p className="mb-0.5 text-[10px] uppercase tracking-wider text-white/45">
                              {msg.staffName}
                            </p>
                          ) : null}
                          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                          <p
                            className={`mt-1 text-[10px] ${
                              mine ? "text-[#0B0B0C]/60" : "text-white/35"
                            }`}
                          >
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}

                  {showFollowUp && !followSaved && !chatClosed ? (
                    <div className="rounded-2xl border border-[#C9A88B]/25 bg-[#C9A88B]/10 px-3 py-3 text-sm text-[#F5EDE4]">
                      <p className="text-white/80">
                        {config?.offlineMessage ||
                          "Our team is currently unavailable. Would you like us to contact you?"}
                      </p>
                      <label className="mt-3 block text-xs text-white/55">
                        Email
                        <input
                          type="email"
                          value={followEmail}
                          onChange={(e) => setFollowEmail(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#C9A88B]"
                          placeholder="you@email.com"
                        />
                      </label>
                      <label className="mt-2 block text-xs text-white/55">
                        Phone (optional)
                        <input
                          type="tel"
                          value={followPhone}
                          onChange={(e) => setFollowPhone(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#C9A88B]"
                          placeholder="+420…"
                        />
                      </label>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          disabled={busy || !followEmail.trim()}
                          onClick={() => void submitFollowUp()}
                          className="rounded-lg bg-[#C9A88B] px-3 py-2 text-xs font-semibold text-[#0B0B0C] disabled:opacity-50"
                        >
                          Send contact
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowFollowUp(false)}
                          className="rounded-lg px-3 py-2 text-xs text-white/60 hover:text-white"
                        >
                          Not now
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {followSaved ? (
                    <p className="text-center text-xs text-[#C9A88B]/90">
                      Thank you — we will contact you soon.
                    </p>
                  ) : null}
                </div>

                {error ? <p className="px-4 text-xs text-red-300">{error}</p> : null}

                {chatClosed ? (
                  <div className="space-y-2 border-t border-white/10 p-3">
                    <p className="text-center text-xs text-white/55">
                      This conversation is closed. You can&apos;t send new messages here.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void requestMoreHelp()}
                      className="w-full rounded-xl border border-[#C9A88B]/50 bg-[#C9A88B]/15 px-4 py-3 text-sm font-semibold text-[#C9A88B] hover:bg-[#C9A88B]/25 disabled:opacity-40"
                    >
                      I still need help
                    </button>
                  </div>
                ) : (
                  <form
                    className="flex items-end gap-2 border-t border-white/10 p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void sendMessage();
                    }}
                  >
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={1}
                      placeholder="Write a message…"
                      disabled={!canSend}
                      className="max-h-28 min-h-[42px] flex-1 resize-none rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#C9A88B]/60 disabled:opacity-50"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage();
                        }
                      }}
                    />
                    <button
                      type="submit"
                      disabled={!canSend || !draft.trim()}
                      className="flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-[#C9A88B] text-[#0B0B0C] disabled:opacity-40"
                      aria-label="Send"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                )}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Optional: clear session when guest wants a fresh chat (not exposed by default). */
export function resetGuestChatSessionLocal() {
  clearStoredSessionId();
}
