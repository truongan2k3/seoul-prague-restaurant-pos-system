"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { BookingCta } from "@/components/landing/booking-cta";
import type { WebsiteContent } from "@/lib/website/types";

const NAV = [
  { href: "/landing#home", label: "Home" },
  { href: "/landing#about", label: "About" },
  { href: "/landing/menu", label: "Menu" },
  { href: "/landing#gallery", label: "Gallery" },
  { href: "/landing#contact", label: "Contact" },
];

interface LandingNavbarProps {
  content: WebsiteContent;
}

export function LandingNavbar({ content }: LandingNavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const logoUrl = content.media.logo?.fileUrl;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          scrolled
            ? "border-b border-white/10 bg-[#0B0B0C]/95 backdrop-blur-md"
            : "bg-gradient-to-b from-black/60 to-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/landing#home" className="flex items-center gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={content.settings.restaurantName} className="h-10 w-10 object-contain" />
            ) : (
              <span className="landing-serif text-lg font-medium tracking-wide text-[#E8D5C4]">
                {content.settings.restaurantName.split(" ")[0]}
              </span>
            )}
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-xs font-medium uppercase tracking-[0.18em] text-white/80 transition hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:block">
            <BookingCta size="sm" />
          </div>

          <button
            type="button"
            className="rounded p-2 text-white lg:hidden"
            aria-label="Toggle menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {open ? (
          <div className="border-t border-white/10 bg-[#0B0B0C] px-5 py-6 lg:hidden">
            <nav className="flex flex-col gap-4">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="text-sm uppercase tracking-[0.16em] text-white/90"
                >
                  {item.label}
                </Link>
              ))}
              <BookingCta className="mt-2 w-full" />
            </nav>
          </div>
        ) : null}
      </header>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0B0B0C]/95 p-3 backdrop-blur-md lg:hidden">
        <BookingCta className="w-full" size="md" />
      </div>
    </>
  );
}
