"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Clock,
  Film,
  ImageIcon,
  LayoutDashboard,
  Paintbrush,
  Search,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";

const LINKS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/designer", label: "Visual designer", icon: Paintbrush },
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
  const isDesigner = pathname === "/admin/designer";

  // Full-screen studio chrome for the visual designer (Figma / Webflow style).
  if (isDesigner) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-[#ececef] text-gray-900 dark:bg-[#121214] dark:text-gray-100">
        <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-black/10 bg-white/90 px-3 backdrop-blur dark:border-white/10 dark:bg-[#1a1a1c]/95">
          <div className="flex items-center gap-3 text-sm">
            <Link
              href="/admin"
              className="rounded-md px-2 py-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-white"
            >
              ← CMS
            </Link>
            <span className="h-4 w-px bg-gray-200 dark:bg-white/15" />
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Paintbrush className="h-3.5 w-3.5 text-[#C9A88B]" />
              Visual designer
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <Link href="/" target="_blank" className="hover:text-gray-900 dark:hover:text-white">
              Live site ↗
            </Link>
            <Link href="/app" className="hover:text-gray-900 dark:hover:text-white">
              POS
            </Link>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </div>
    );
  }

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
              <Link href="/" className="block text-blue-600 hover:underline dark:text-blue-400">
                View landing page →
              </Link>
              <Link href="/reservation" className="block text-blue-600 hover:underline dark:text-blue-400">
                Reservation system →
              </Link>
              <Link href="/app" className="block text-gray-500 hover:underline">
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
