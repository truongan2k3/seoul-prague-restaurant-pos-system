"use client";

import Link from "next/link";
import type { WebsitePageSection } from "@/lib/website/types";
import {
  responsiveBodyClass,
  responsiveHeadlineClass,
  responsivePaddingClass,
  sectionVisibilityClass,
} from "@/lib/website/page-layout";

const BG: Record<"dark" | "charcoal" | "warm", string> = {
  dark: "bg-[#0B0B0C]",
  charcoal: "bg-[#121214]",
  warm: "bg-gradient-to-br from-[#2a1714] via-[#171012] to-[#0B0B0C]",
};

export function LandingCustomText({ section }: { section: WebsitePageSection }) {
  const bg = BG[section.props?.background ?? "charcoal"];
  return (
    <section
      className={`${bg} ${responsivePaddingClass(section)} ${sectionVisibilityClass(section)}`}
    >
      <div className="mx-auto max-w-3xl px-5 text-center lg:px-8">
        {section.props?.eyebrow ? (
          <p className="text-xs uppercase tracking-[0.35em] text-[#C9A88B]">{section.props.eyebrow}</p>
        ) : null}
        <h2 className={`landing-serif mt-4 text-white ${responsiveHeadlineClass(section)}`}>
          {section.props?.headline || "Spotlight"}
        </h2>
        {section.props?.body ? (
          <p className={`mt-5 text-white/70 ${responsiveBodyClass(section)}`}>{section.props.body}</p>
        ) : null}
      </div>
    </section>
  );
}

export function LandingCustomCta({ section }: { section: WebsitePageSection }) {
  const bg = BG[section.props?.background ?? "warm"];
  return (
    <section
      className={`${bg} ${responsivePaddingClass(section)} ${sectionVisibilityClass(section)}`}
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-5 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div className="max-w-2xl">
          {section.props?.eyebrow ? (
            <p className="text-xs uppercase tracking-[0.35em] text-[#C9A88B]">
              {section.props.eyebrow}
            </p>
          ) : null}
          <h2 className={`landing-serif mt-4 text-white ${responsiveHeadlineClass(section)}`}>
            {section.props?.headline || "Book your table"}
          </h2>
          {section.props?.body ? (
            <p className={`mt-4 text-white/70 ${responsiveBodyClass(section)}`}>
              {section.props.body}
            </p>
          ) : null}
        </div>
        <Link
          href={section.props?.ctaHref || "/reservation"}
          className="inline-flex min-h-[48px] items-center rounded-full bg-[#C9A88B] px-6 text-sm font-semibold text-[#1a1210] transition hover:bg-[#d8b89a]"
        >
          {section.props?.ctaLabel || "Make a reservation"}
        </Link>
      </div>
    </section>
  );
}

export function LandingSpacer({ section }: { section: WebsitePageSection }) {
  const size =
    section.desktop?.padding === "spacious"
      ? "h-24 lg:h-36"
      : section.desktop?.padding === "compact"
        ? "h-8 lg:h-12"
        : "h-14 lg:h-20";
  return <div className={`${size} ${sectionVisibilityClass(section)} bg-[#0B0B0C]`} aria-hidden />;
}
