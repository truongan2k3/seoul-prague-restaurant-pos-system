import Link from "next/link";
import { fetchWebsiteContent } from "@/src/lib/website-public";

export default async function AdminDashboardPage() {
  const content = await fetchWebsiteContent();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Website dashboard</h1>
        <p className="mt-2 text-sm text-gray-500">
          Manage the public landing page at <Link href="/landing" className="text-blue-600 underline">/landing</Link>.
          Reservations remain on the existing system at{" "}
          <Link href="/reservation" className="text-blue-600 underline">/reservation</Link>.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { label: "Menu items", value: content.menuItems.length },
          { label: "Gallery images", value: content.gallery.length },
          { label: "Videos", value: content.videos.length },
          { label: "Amenities", value: content.amenities.filter((row) => row.enabled).length },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        Run <code className="rounded bg-black/5 px-1">supabase/patch-website-cms.sql</code> on your Supabase project
        before saving content. Until then, the landing page uses safe placeholder defaults.
      </section>
    </div>
  );
}
