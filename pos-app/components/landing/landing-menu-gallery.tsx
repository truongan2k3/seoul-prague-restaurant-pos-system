"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookingCta } from "@/components/landing/booking-cta";
import { formatOpeningHoursOneLine } from "@/lib/website/opening-hours-display";
import { resolveSocialLinks, socialPlatformLabel } from "@/lib/website/social-links";
import type { WebsiteContent, WebsiteSocialLink } from "@/lib/website/types";

function formatPrice(price: number | null, currency: string): string {
  if (price == null) return "Price on request";
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency }).format(price);
}

export function LandingMenuPreview({ content }: { content: WebsiteContent }) {
  const reduceMotion = useReducedMotion();
  const categories = content.menuCategories.filter((cat) => cat.enabled);
  const items = content.menuItems.filter((item) => item.available);

  return (
    <section id="menu" className="bg-[#0B0B0C] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Menu</p>
            <h2 className="landing-serif mt-4 text-3xl text-white lg:text-5xl">
              {content.menuPdfs.length > 0 ? "Browse our menu" : "Curated selections"}
            </h2>
            {content.menuPdfs.length > 0 ? (
              <p className="mt-3 text-sm text-white/55">
                Flip through Czech, English, and Chinese menu books.
              </p>
            ) : null}
          </div>
          <Link
            href="/menu"
            className="text-sm uppercase tracking-[0.16em] text-[#C9A88B] hover:text-white"
          >
            Full menu →
          </Link>
        </div>
        <div className="space-y-12">
          {content.menuPdfs.length > 0 ? (
            <div className="rounded-xl border border-white/10 bg-[#121214] p-6 text-center">
              <p className="text-white/70">Digital menu books ready — Czech, English & Chinese</p>
              <Link
                href="/menu"
                className="mt-4 inline-block text-sm uppercase tracking-[0.16em] text-[#C9A88B] hover:text-white"
              >
                Open menu book →
              </Link>
            </div>
          ) : null}
          {categories.slice(0, 3).map((category) => {
            const categoryItems = items.filter((item) => item.categoryId === category.id).slice(0, 4);
            if (categoryItems.length === 0) return null;
            return (
              <div key={category.id}>
                <h3 className="mb-6 border-b border-white/10 pb-3 text-sm uppercase tracking-[0.22em] text-white/80">
                  {category.name}
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {categoryItems.map((item, index) => (
                    <motion.article
                      key={item.id}
                      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.05 }}
                      className="flex gap-4 border border-white/8 bg-[#121214] p-4"
                    >
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt={item.name} className="h-20 w-20 shrink-0 object-cover" />
                      ) : (
                        <div className="h-20 w-20 shrink-0 bg-[#1f1f22]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="font-medium text-white">{item.name}</h4>
                          <span className="shrink-0 text-sm text-[#C9A88B]">
                            {formatPrice(item.price, item.currency)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-white/55">{item.description}</p>
                      </div>
                    </motion.article>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-14 text-center">
          <BookingCta />
        </div>
      </div>
    </section>
  );
}

const GALLERY_PREVIEW_COUNT = 4;

export function LandingGallery({ content }: { content: WebsiteContent }) {
  const reduceMotion = useReducedMotion();
  const items = content.gallery.filter((item) => item.imageUrl);
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return (
      <section id="gallery" className="bg-[#0F0F10] py-24 lg:py-32">
        <div className="mx-auto max-w-7xl px-5 text-center lg:px-8">
          <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Gallery</p>
          <h2 className="landing-serif mt-4 text-3xl text-white">Atmosphere & plates</h2>
          <p className="mt-4 text-white/50">Upload gallery images in /admin to showcase your restaurant.</p>
        </div>
      </section>
    );
  }

  const visible = expanded ? items : items.slice(0, GALLERY_PREVIEW_COUNT);
  const hasMore = items.length > GALLERY_PREVIEW_COUNT;

  return (
    <section id="gallery" className="bg-[#0F0F10] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Gallery</p>
        <h2 className="landing-serif mt-4 mb-10 text-3xl text-white lg:text-5xl">Atmosphere & plates</h2>

        <div className="relative">
          <motion.div layout className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
            <AnimatePresence initial={false}>
              {visible.map((item, index) => {
                const isLastPreview =
                  !expanded && hasMore && index === GALLERY_PREVIEW_COUNT - 1;
                return (
                  <motion.figure
                    key={item.id}
                    layout
                    initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.35, delay: Math.min(index, 6) * 0.04 }}
                    className="relative aspect-[4/5] overflow-hidden border border-white/10 bg-[#121214]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.title || "Gallery"}
                      className={`h-full w-full object-cover transition duration-500 ${
                        isLastPreview ? "scale-105 blur-[2px] brightness-75" : ""
                      }`}
                    />
                    {isLastPreview ? (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0F0F10] via-[#0F0F10]/35 to-transparent"
                      />
                    ) : null}
                  </motion.figure>
                );
              })}
            </AnimatePresence>
          </motion.div>

          {hasMore && !expanded ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0F0F10] to-transparent" />
          ) : null}
        </div>

        {hasMore ? (
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-full border border-[#C9A88B]/50 px-8 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#C9A88B] transition hover:border-[#C9A88B] hover:bg-[#C9A88B]/10 hover:text-white"
            >
              {expanded
                ? "Show less"
                : `Show more · ${items.length - GALLERY_PREVIEW_COUNT} more`}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function LandingVideo({ content }: { content: WebsiteContent }) {
  const video = content.videos.find((row) => row.enabled && row.slot === "promo") ?? content.videos.find((row) => row.enabled);
  if (!video) return null;

  return (
    <section className="bg-[#0B0B0C] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Film</p>
        <h2 className="landing-serif mt-4 mb-8 text-3xl text-white lg:text-5xl">{video.title || "Our story in motion"}</h2>
        <div className="relative aspect-video overflow-hidden border border-white/10 bg-black">
          <video
            className="h-full w-full object-cover"
            controls
            playsInline
            preload="none"
            poster={video.posterUrl || undefined}
          >
            <source src={video.videoUrl} />
          </video>
        </div>
        {video.description ? <p className="mt-4 max-w-2xl text-white/60">{video.description}</p> : null}
      </div>
    </section>
  );
}

function AmenitiesBlock({ content }: { content: WebsiteContent }) {
  const amenities = content.amenities.filter((row) => row.enabled);
  if (amenities.length === 0) return null;

  return (
    <div className="mt-16 border-t border-white/10 pt-14">
      <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Amenities</p>
      <h3 className="landing-serif mt-3 text-2xl text-white lg:text-3xl">Comfort & details</h3>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {amenities.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-5 border border-white/10 px-5 py-5 text-white/85"
          >
            {item.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.iconUrl}
                alt=""
                className="h-16 w-16 shrink-0 object-contain sm:h-20 sm:w-20"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-16 w-16 shrink-0 items-center justify-center border border-[#C9A88B]/40 text-lg uppercase tracking-wide text-[#C9A88B] sm:h-20 sm:w-20"
              >
                {(item.label.trim()[0] || "•").toUpperCase()}
              </span>
            )}
            <span className="text-base leading-snug sm:text-lg">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialIcon({ platform }: { platform: string }) {
  const key = platform.toLowerCase();
  const className = "h-5 w-5";
  if (key === "instagram") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (key === "facebook") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M14 9h3V6h-3c-1.7 0-3 1.3-3 3v2H9v3h2v7h3v-7h2.5l.5-3H14V9z" />
      </svg>
    );
  }
  if (key === "youtube") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M23 7.5s-.2-1.6-.9-2.3c-.8-.9-1.8-.9-2.2-1C16.2 4 12 4 12 4h0s-4.2 0-7.9.2c-.5.1-1.4.1-2.2 1C1.2 5.9 1 7.5 1 7.5S.8 9.4.8 11.2v1.6C.8 14.6 1 16.5 1 16.5s.2 1.6.9 2.3c.8.9 1.9.9 2.4 1 1.7.2 7.7.2 7.7.2s4.2 0 7.9-.2c.5-.1 1.4-.1 2.2-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.7v-1.6C23.2 9.4 23 7.5 23 7.5zM9.8 14.8V8.9l5.3 2.95-5.3 2.95z" />
      </svg>
    );
  }
  if (key === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .56.04.82.12V9.01a6.27 6.27 0 0 0-.82-.05A6.34 6.34 0 0 0 3.16 15.3a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.73a8.18 8.18 0 0 0 4.78 1.52V6.79a4.85 4.85 0 0 1-1.02-.1z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.93" />
      <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.07" />
    </svg>
  );
}

function SocialLinksRow({ links }: { links: WebsiteSocialLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="mt-14 border-t border-white/10 pt-12">
      <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Follow us</p>
      <ul className="mt-6 flex flex-wrap gap-3">
        {links.map((link) => (
          <li key={link.id}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={socialPlatformLabel(link.platform)}
              className="inline-flex h-12 w-12 items-center justify-center border border-white/15 text-white/80 transition hover:border-[#C9A88B]/60 hover:text-[#C9A88B]"
            >
              <SocialIcon platform={link.platform} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Standalone amenities — hidden when Visit Us already embeds amenities. */
export function LandingAmenities({
  content,
  embeddedInContact = false,
}: {
  content: WebsiteContent;
  embeddedInContact?: boolean;
}) {
  if (embeddedInContact) return null;
  const amenities = content.amenities.filter((row) => row.enabled);
  if (amenities.length === 0) return null;

  return (
    <section className="border-y border-white/10 bg-[#141416] py-20">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <AmenitiesBlock content={content} />
      </div>
    </section>
  );
}

export function LandingContact({ content }: { content: WebsiteContent }) {
  const { settings } = content;
  const hoursLine = useMemo(
    () => formatOpeningHoursOneLine(settings.openingHours),
    [settings.openingHours],
  );
  const socialLinks = useMemo(
    () =>
      resolveSocialLinks({
        socialLinks: settings.socialLinks,
        instagramUrl: settings.instagramUrl,
        facebookUrl: settings.facebookUrl,
        tiktokUrl: settings.tiktokUrl,
      }),
    [settings],
  );

  return (
    <section id="contact" className="bg-[#0B0B0C] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Visit us</p>
            <h2 className="landing-serif mt-4 text-3xl text-white lg:text-5xl">
              {settings.restaurantName}
            </h2>
            <div className="mt-8 space-y-3 text-white/70">
              {settings.address ? <p className="text-base leading-relaxed">{settings.address}</p> : null}
              {settings.phone ? (
                <p>
                  <a href={`tel:${settings.phone.replace(/\s+/g, "")}`} className="hover:text-white">
                    {settings.phone}
                  </a>
                </p>
              ) : null}
              {settings.email ? (
                <p>
                  <a href={`mailto:${settings.email}`} className="hover:text-white">
                    {settings.email}
                  </a>
                </p>
              ) : null}
            </div>
            {settings.googleMapsUrl ? (
              <a
                href={settings.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-block text-sm uppercase tracking-[0.14em] text-[#C9A88B] hover:text-white"
              >
                Open in Google Maps →
              </a>
            ) : null}
            <div className="mt-10">
              <BookingCta size="lg" />
            </div>
          </div>

          <div className="lg:border-l lg:border-white/10 lg:pl-16">
            <h3 className="text-xs uppercase tracking-[0.28em] text-[#C9A88B]">Opening hours</h3>
            <p className="mt-5 text-lg leading-relaxed text-white/85 sm:text-xl">{hoursLine}</p>
          </div>
        </div>

        <AmenitiesBlock content={content} />
        <SocialLinksRow links={socialLinks} />
      </div>
    </section>
  );
}

export function LandingFooter({ content }: { content: WebsiteContent }) {
  const { settings } = content;
  const socialLinks = resolveSocialLinks({
    socialLinks: settings.socialLinks,
    instagramUrl: settings.instagramUrl,
    facebookUrl: settings.facebookUrl,
    tiktokUrl: settings.tiktokUrl,
  });

  return (
    <footer className="border-t border-white/10 bg-[#080809] pb-24 pt-16 lg:pb-16">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <p className="landing-serif text-2xl text-white">{settings.restaurantName}</p>
            <p className="mt-3 max-w-md text-sm text-white/55">{settings.tagline}</p>
            <div className="mt-6">
              <BookingCta size="sm" />
            </div>
            {socialLinks.length > 0 ? (
              <ul className="mt-8 flex flex-wrap gap-2">
                {socialLinks.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={socialPlatformLabel(link.platform)}
                      className="inline-flex h-10 w-10 items-center justify-center border border-white/15 text-white/70 hover:border-[#C9A88B]/50 hover:text-[#C9A88B]"
                    >
                      <SocialIcon platform={link.platform} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Contact</p>
            <p className="mt-4 text-sm text-white/70">{settings.address}</p>
            <p className="mt-2 text-sm text-white/70">{settings.phone}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Links</p>
            <ul className="mt-4 space-y-2 text-sm text-white/70">
              <li><Link href="/menu" className="hover:text-white">Menu</Link></li>
              <li><Link href="/reservation" className="hover:text-white">Reservations</Link></li>
              <li><Link href="/admin" className="hover:text-white">Website admin</Link></li>
            </ul>
          </div>
        </div>
        <p className="mt-12 text-xs text-white/35">© {new Date().getFullYear()} {settings.restaurantName}</p>
      </div>
    </footer>
  );
}
