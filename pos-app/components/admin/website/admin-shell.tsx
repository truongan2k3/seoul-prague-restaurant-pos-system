"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Clock,
  Film,
  ImageIcon,
  LayoutDashboard,
  Sparkles,
  UtensilsCrossed,
  Search,
} from "lucide-react";

const LINKS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/media", label: "Media", icon: ImageIcon },
  { href: "/admin/restaurant", label: "Restaurant", icon: Building2 },
  { href: "/admin/hours", label: "Opening hours", icon: Clock },
  { href: "/admin/amenities", label: "Amenities", icon: Sparkles },
  { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/admin/gallery", label: "Gallery", icon: ImageIcon },
  { href: "/admin/videos", label: "Videos", icon: Film },
  { href: "/admin/seo", label: "SEO", icon: Search },
];

export function WebsiteAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 lg:flex-row lg:px-8">
        <aside className="lg:w-64 lg:shrink-0">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Website CMS</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Marketing & landing content</p>
            <nav className="mt-4 space-y-1">
              {LINKS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                      active
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-6 space-y-2 border-t border-gray-200 pt-4 text-sm dark:border-gray-800">
              <Link href="/landing" className="block text-blue-600 hover:underline dark:text-blue-400">
                View landing page →
              </Link>
              <Link href="/reservation" className="block text-blue-600 hover:underline dark:text-blue-400">
                Reservation system →
              </Link>
              <Link href="/" className="block text-gray-500 hover:underline">
                Back to POS
              </Link>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
