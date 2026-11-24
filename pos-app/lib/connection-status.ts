export type ConnectionStatus = "online" | "offline" | "no-network";

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  online: "Online",
  offline: "Offline",
  "no-network": "No Network",
};

export function getConnectionStatusLabel(status: ConnectionStatus, language?: string): string {
  if (language === "vi") {
    if (status === "online") return "Trực tuyến";
    if (status === "offline") return "Ngoại tuyến";
    return "Mất mạng";
  }
  if (language === "cs") {
    if (status === "online") return "Online";
    if (status === "offline") return "Offline";
    return "Bez sítě";
  }
  return CONNECTION_STATUS_LABELS[status];
}

export const CONNECTION_STATUS_COLORS: Record<ConnectionStatus, string> = {
  online: "bg-emerald-400",
  offline: "bg-amber-400",
  "no-network": "bg-red-500",
};

export function resolveConnectionStatus(input: {
  networkOnline: boolean;
  realtimeConnected: boolean;
}): ConnectionStatus {
  if (!input.networkOnline) return "no-network";
  if (!input.realtimeConnected) return "offline";
  return "online";
}
