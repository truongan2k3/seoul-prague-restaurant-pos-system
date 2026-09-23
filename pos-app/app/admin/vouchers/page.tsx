export const dynamic = "force-dynamic";
export const revalidate = 0;

import { AdminVoucherSettingsEditor } from "@/components/voucher-settings-fields";

export default function AdminVouchersPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Vouchers</h1>
        <p className="mt-2 text-sm text-gray-500">
          Configure gift voucher sales, bank transfer details, and Czech payment QR. Staff verify
          payments and redeem codes in the POS Vouchers tab.
        </p>
      </header>
      <AdminVoucherSettingsEditor />
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        Database tables are created by{" "}
        <code className="rounded bg-white/70 px-1 dark:bg-black/30">
          supabase/patch-vouchers.sql
        </code>
        . Public purchase page:{" "}
        <a href="/voucher" className="underline">
          /voucher
        </a>
        .
      </section>
    </div>
  );
}
