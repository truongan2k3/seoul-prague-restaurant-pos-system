"use client";

import Link from "next/link";
import { CalendarOff } from "lucide-react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-menu-gallery";
import { BookingCta } from "@/components/landing/booking-cta";
import type { WebsiteContent } from "@/lib/website/types";

export function LandingSpecialEventPageView({ content }: { content: WebsiteContent }) {
  return (
    <div className="landing-theme min-h-screen bg-[#0B0B0C] text-white">
      <LandingNavbar content={content} />
      <main className="pb-24 pt-28 lg:pb-16">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Link href="/" className="text-sm text-[#C9A88B] hover:text-white">
            ← Back to home
          </Link>
          <p className="mt-8 text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Special Event</p>
          <h1 className="landing-serif mt-4 text-4xl lg:text-6xl">Special events</h1>
          <p className="mt-4 max-w-2xl text-white/60">
            Promotions, seasonal nights, and limited offers will appear here when available.
          </p>

          <div className="mt-12 flex min-h-[min(52vh,420px)] flex-col items-center justify-center border border-dashed border-white/15 bg-[#121214] px-6 py-16 text-center sm:px-10">
            <CalendarOff className="h-10 w-10 text-white/35" aria-hidden />
            <h2 className="landing-serif mt-6 text-2xl text-white sm:text-3xl">
              No events right now
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-white/55">
              There are no special programs or promotions at the moment. Check back soon — posters
              and offers will show up on this page when we have something new.
            </p>
            <div className="mt-10">
              <BookingCta size="md" />
            </div>
          </div>
        </div>
      </main>
      <LandingFooter content={content} />
    </div>
  );
}
