import Link from "next/link";
import { VoucherPublicView } from "@/components/landing/voucher-public-view";
import { getGuestVoucherViewByToken } from "@/src/lib/voucher-server";

export const dynamic = "force-dynamic";

export default async function VoucherPublicViewPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";
  const view = token ? await getGuestVoucherViewByToken(token) : null;

  return (
    <main className="min-h-screen bg-[#0b0a09] px-4 py-10 text-[#fbf8f3] sm:px-6 lg:py-14">
      {!view || view.error || !view.order || !view.design ? (
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-[#141210] p-8 text-center">
          <h1 className="font-serif text-2xl text-[#fbf8f3]">Voucher unavailable</h1>
          <p className="mt-2 text-sm text-stone-400">
            {view?.error ?? "This voucher link is invalid or expired."}
          </p>
          <Link
            href="/voucher"
            className="mt-6 inline-block rounded-xl bg-[#C9A88B] px-5 py-2.5 text-sm font-semibold text-[#14110f]"
          >
            Buy a Gift Voucher
          </Link>
        </div>
      ) : view.order.paymentStatus !== "paid" || view.order.orderStatus === "cancelled" ? (
        <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-[#141210] p-8 text-center">
          <h1 className="font-serif text-2xl text-[#fbf8f3]">Voucher pending</h1>
          <p className="mt-2 text-sm text-stone-400">
            Order {view.order.orderId} has not been confirmed yet. Once payment is verified, your gift voucher will appear here.
          </p>
        </div>
      ) : (
        <VoucherPublicView
          token={token}
          order={view.order}
          codes={view.codes}
          brandLine={view.design.frontBrandLine}
        />
      )}
    </main>
  );
}
