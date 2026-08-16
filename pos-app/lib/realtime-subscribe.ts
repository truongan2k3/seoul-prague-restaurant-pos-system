import type {
  RealtimeChannel,
  RealtimePostgresChangesFilter,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { supabase } from "@/src/lib/supabase";

const DEFAULT_DEBOUNCE_MS = 400;
const RECONNECT_DELAY_MS = 2_000;

let channelSeq = 0;

function uniqueChannelName(base: string): string {
  channelSeq += 1;
  return `${base}-${channelSeq}`;
}

function createResilientSubscription(
  channelBase: string,
  filter: RealtimePostgresChangesFilter<"*"> | RealtimePostgresChangesFilter<"UPDATE"> | RealtimePostgresChangesFilter<"INSERT">,
  onRawEvent: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
  debounceMs: number,
): () => void {
  let disposed = false;
  let channel: RealtimeChannel | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingPayload: RealtimePostgresChangesPayload<Record<string, unknown>> | null = null;

  const flush = () => {
    debounceTimer = null;
    if (disposed || !pendingPayload) return;
    const payload = pendingPayload;
    pendingPayload = null;
    onRawEvent(payload);
  };

  const schedule = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    pendingPayload = payload;
    if (debounceMs <= 0) {
      flush();
      return;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, debounceMs);
  };

  const teardownChannel = () => {
    if (!channel) return;
    const current = channel;
    channel = null;
    void supabase.removeChannel(current);
  };

  const connect = () => {
    if (disposed) return;
    teardownChannel();

    channel = supabase
      .channel(uniqueChannelName(channelBase))
      .on("postgres_changes", filter, schedule)
      .subscribe((status) => {
        if (disposed) return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          teardownChannel();
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
      });
  };

  connect();

  return () => {
    disposed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    teardownChannel();
  };
}

/** Debounced postgres listener for full-table reload hooks. */
export function subscribeToPostgresChanges(
  channelBase: string,
  filter: RealtimePostgresChangesFilter<"*">,
  onChange: () => void,
  options?: { debounceMs?: number },
): () => void {
  return createResilientSubscription(
    channelBase,
    filter,
    () => onChange(),
    options?.debounceMs ?? DEFAULT_DEBOUNCE_MS,
  );
}

/** Postgres listener that passes row payload (no debounce by default). */
export function subscribeToPostgresRowChanges(
  channelBase: string,
  filter:
    | RealtimePostgresChangesFilter<"*">
    | RealtimePostgresChangesFilter<"UPDATE">
    | RealtimePostgresChangesFilter<"INSERT">,
  onChange: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
  options?: { debounceMs?: number },
): () => void {
  return createResilientSubscription(
    channelBase,
    filter,
    (payload) => onChange(payload),
    options?.debounceMs ?? 0,
  );
}
