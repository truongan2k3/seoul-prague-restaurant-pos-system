"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Download, QrCode, RefreshCw } from "lucide-react";
import { HeaderClockWithStatus } from "@/components/connection-status-badge";
import { NotificationBell } from "@/components/notification-bell";
import { useApp } from "@/contexts/app-context";
import {
  buildTableGuestUrl,
  isTableQrEligible,
  requestKindLabel,
  type TableGuestRequestRecord,
} from "@/lib/table-guest";
import type { RestaurantTable } from "@/lib/types";

type Props = {
  tables: RestaurantTable[];
};

export function DynamicQrServicesView({ tables }: Props) {
  const { translate, currentStaffUser } = useApp();
  const [selectedId, setSelectedId] = useState("");
  const [pending, setPending] = useState<TableGuestRequestRecord[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const eligibleTables = useMemo(
    () =>
      tables
        .filter((table) => isTableQrEligible(table))
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    [tables],
  );

  useEffect(() => {
    if (!selectedId && eligibleTables[0]) setSelectedId(eligibleTables[0].id);
  }, [eligibleTables, selectedId]);

  const selected = eligibleTables.find((table) => table.id === selectedId) ?? null;
  const guestUrl = selected
    ? buildTableGuestUrl(
        selected.id,
        typeof window !== "undefined" ? window.location.origin : undefined,
      )
    : "";

  async function loadPending() {
    const response = await fetch("/api/table-guest/requests", { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as {
      requests?: TableGuestRequestRecord[];
    };
    setPending(payload.requests ?? []);
  }

  useEffect(() => {
    void loadPending();
    const timer = window.setInterval(() => void loadPending(), 12_000);
    return () => window.clearInterval(timer);
  }, []);

  async function completeRequest(id: string) {
    setBusyId(id);
    try {
      const response = await fetch(`/api/table-guest/requests/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "completed",
          completedBy: currentStaffUser?.name ?? currentStaffUser?.id ?? "staff",
        }),
      });
      if (response.ok) {
        setPending((prev) => prev.filter((row) => row.id !== id));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function downloadQr(table: RestaurantTable) {
    setMessage(null);
    try {
      const response = await fetch(`/api/table-guest/${encodeURIComponent(table.id)}/qr`);
      if (!response.ok) {
        setMessage(translate("tableQrDownloadFailed"));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `table-${table.label.replace(/[^a-zA-Z0-9_-]+/g, "_")}-qr.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(translate("tableQrDownloadOk"));
    } catch {
      setMessage(translate("tableQrDownloadFailed"));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200/80 bg-background px-2.5 py-1.5 sm:px-4 sm:py-2.5 lg:px-6 lg:py-4 dark:border-gray-800 dark:bg-gray-900">
        <h1 className="text-sm font-semibold sm:text-base lg:text-lg">
          {translate("dynamicQrServices")}
        </h1>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <HeaderClockWithStatus />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                <QrCode className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{translate("tableQrTitle")}</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {translate("tableQrHint")}
                </p>
              </div>
            </div>

            {message ? (
              <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                {message}
              </p>
            ) : null}

            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-950 dark:text-gray-400">
                  <tr>
                    <th className="px-3 py-2">{translate("table")}</th>
                    <th className="px-3 py-2">URL</th>
                    <th className="px-3 py-2 text-right">PNG</th>
                  </tr>
                </thead>
                <tbody>
                  {eligibleTables.map((table) => {
                    const url = buildTableGuestUrl(
                      table.id,
                      typeof window !== "undefined" ? window.location.origin : undefined,
                    );
                    return (
                      <tr
                        key={table.id}
                        className={`border-t border-gray-100 dark:border-gray-800 ${
                          selectedId === table.id ? "bg-blue-50/70 dark:bg-blue-950/20" : ""
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setSelectedId(table.id)}
                            className="font-semibold"
                          >
                            {table.label}
                          </button>
                        </td>
                        <td className="max-w-[240px] truncate px-3 py-2.5 font-mono text-xs text-gray-500">
                          {url}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => void downloadQr(table)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                          >
                            <Download className="h-3.5 w-3.5" />
                            PNG
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {eligibleTables.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-sm text-gray-500">
                        {translate("tableQrNoTables")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {selected ? (
              <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-950/50">
                <p className="font-medium">
                  {translate("table")} {selected.label}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-gray-500">{guestUrl}</p>
                <p className="mt-2 text-xs text-gray-500">{translate("tableQrFixedNote")}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{translate("tableQrInboxTitle")}</h2>
              <button
                type="button"
                onClick={() => void loadPending()}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium dark:border-gray-700"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Reload
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {translate("tableQrInboxHint")}
            </p>

            <ul className="mt-4 space-y-2">
              {pending.map((request) => (
                <li
                  key={request.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-3 dark:border-amber-900/50 dark:bg-amber-950/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">
                        {translate("table")} {request.tableLabel} · {requestKindLabel(request.kind)}
                      </p>
                      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                        {new Date(request.createdAt).toLocaleTimeString()}
                        {request.payload.paymentMethod
                          ? ` · ${request.payload.paymentMethod}`
                          : ""}
                        {request.payload.banchan?.length
                          ? ` · ${request.payload.banchan
                              .map((item) => `${item.quantity}× ${item.label}`)
                              .join(", ")}`
                          : ""}
                        {request.note ? ` · ${request.note}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === request.id}
                      onClick={() => void completeRequest(request.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      {translate("tableQrDone")}
                    </button>
                  </div>
                </li>
              ))}
              {pending.length === 0 ? (
                <li className="rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500 dark:border-gray-700">
                  {translate("tableQrInboxEmpty")}
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
