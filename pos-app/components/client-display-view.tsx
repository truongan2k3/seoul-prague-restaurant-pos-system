"use client";

import { useEffect, useState } from "react";
import {
  getCfdReviewQrUrl,
  subscribeCfdEvents,
  type CfdCheckoutPayload,
  type CfdClientState,
} from "@/lib/cfd-display";
import { formatCzk } from "@/lib/checkout-calculations";

const THANK_YOU_SECONDS = 20;

function CfdClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) {
    return <span className="text-sm text-zinc-400">&nbsp;</span>;
  }

  const datePart = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timePart = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <time dateTime={now.toISOString()} className="text-right text-sm font-medium text-zinc-300 sm:text-base">
      {datePart} - {timePart}
    </time>
  );
}

function CfdHeader() {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/95 px-6 py-4 backdrop-blur">
      <div>
        <p className="text-xl font-bold tracking-[0.2em] text-white sm:text-2xl">SEOUL PRAGUE</p>
        <p className="mt-0.5 text-xs uppercase tracking-widest text-zinc-500">Customer Display</p>
      </div>
      <CfdClock />
    </header>
  );
}

function CheckoutView({ checkout }: { checkout: CfdCheckoutPayload }) {
  const displayTotal = checkout.amountDueNow ?? checkout.total;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-zinc-800 bg-zinc-900/80 px-6 py-4">
        <p className="text-2xl font-bold text-white sm:text-3xl">Table: {checkout.tableNumber}</p>
        <p className="mt-1 text-sm font-semibold uppercase tracking-widest text-zinc-400">
          Order Details
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900">
          <table className="w-full text-left">
            <thead className="bg-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-300">
              <tr>
                <th className="px-4 py-3 text-center">Qty</th>
                <th className="px-4 py-3">Item</th>
                <th className="hidden px-4 py-3 text-right sm:table-cell">Unit</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {checkout.items.map((item, index) => (
                <tr key={`${item.name}-${index}`} className="text-white">
                  <td className="px-4 py-4 text-center text-2xl font-bold tabular-nums sm:text-3xl">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-4 text-lg font-semibold leading-snug sm:text-xl">{item.name}</td>
                  <td className="hidden px-4 py-4 text-right text-lg tabular-nums text-zinc-300 sm:table-cell">
                    {formatCzk(item.unitPrice)}
                  </td>
                  <td className="px-4 py-4 text-right text-xl font-bold tabular-nums sm:text-2xl">
                    {formatCzk(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="shrink-0 border-t border-zinc-700 bg-zinc-900 px-6 py-5">
        <div className="mx-auto max-w-3xl space-y-2 text-lg text-zinc-300">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatCzk(checkout.subtotal)}</span>
          </div>
          {checkout.discount > 0 && (
            <div className="flex justify-between text-orange-300">
              <span>Discount</span>
              <span className="tabular-nums">−{formatCzk(checkout.discount)}</span>
            </div>
          )}
          {checkout.tip > 0 && (
            <div className="flex justify-between text-emerald-300">
              <span>Tip</span>
              <span className="tabular-nums">{formatCzk(checkout.tip)}</span>
            </div>
          )}
          <div className="flex items-end justify-between border-t border-zinc-700 pt-3">
            <span className="text-xl font-bold uppercase tracking-wide text-white">Total</span>
            <span className="text-4xl font-black tabular-nums text-white sm:text-5xl">
              {formatCzk(displayTotal)} CZK
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ThankYouView({ secondsLeft }: { secondsLeft: number }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <h2 className="text-3xl font-bold text-white sm:text-4xl">Thank you for dining with us!</h2>
      <p className="mt-4 max-w-xl text-lg text-zinc-300 sm:text-xl">
        Please leave us a review to help us improve!
      </p>
      <p className="mt-6 text-4xl tracking-widest text-amber-400" aria-label="5 star rating">
        ⭐⭐⭐⭐⭐
      </p>
      <div className="mt-8 rounded-2xl bg-white p-4 shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getCfdReviewQrUrl(220)}
          alt="Scan to leave a Google review"
          width={220}
          height={220}
          className="h-[220px] w-[220px]"
        />
      </div>
      <p className="mt-4 text-sm text-zinc-500">Scan to review us on Google Maps</p>
      <p className="mt-8 text-xs text-zinc-600">Returning to welcome screen in {secondsLeft}s</p>
    </div>
  );
}

export function ClientDisplayView() {
  const [clientState, setClientState] = useState<CfdClientState>("idle");
  const [checkout, setCheckout] = useState<CfdCheckoutPayload | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(THANK_YOU_SECONDS);

  useEffect(() => {
    return subscribeCfdEvents({
      onStartCheckout: (payload) => {
        setCheckout(payload);
        setClientState("checkout");
      },
      onPaymentSuccess: () => {
        setClientState("thankyou");
        setSecondsLeft(THANK_YOU_SECONDS);
      },
      onCancelCheckout: () => {
        setCheckout(null);
        setClientState("idle");
      },
    });
  }, []);

  useEffect(() => {
    if (clientState !== "thankyou") return;

    setSecondsLeft(THANK_YOU_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setClientState("idle");
          setCheckout(null);
          return THANK_YOU_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [clientState]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      <CfdHeader />

      {clientState === "idle" && <main className="flex-1 bg-zinc-950" aria-hidden />}

      {clientState === "checkout" && checkout && (
        <main className="flex min-h-0 flex-1 flex-col">
          <CheckoutView checkout={checkout} />
        </main>
      )}

      {clientState === "thankyou" && (
        <main className="flex flex-1 flex-col">
          <ThankYouView secondsLeft={secondsLeft} />
        </main>
      )}
    </div>
  );
}
