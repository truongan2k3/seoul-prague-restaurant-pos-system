"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { BookingCta } from "@/components/landing/booking-cta";
import type { WebsiteContent } from "@/lib/website/types";

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

export function LandingGallery({ content }: { content: WebsiteContent }) {
  const items = content.gallery.filter((item) => item.imageUrl);
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

  return (
    <section id="gallery" className="bg-[#0F0F10] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Gallery</p>
        <h2 className="landing-serif mt-4 mb-10 text-3xl text-white lg:text-5xl">Atmosphere & plates</h2>
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {items.map((item) => (
            <figure key={item.id} className="mb-4 break-inside-avoid overflow-hidden border border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imageUrl} alt={item.title || "Gallery"} className="w-full object-cover" />
            </figure>
          ))}
        </div>
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

export function LandingAmenities({ content }: { content: WebsiteContent }) {
  const amenities = content.amenities.filter((row) => row.enabled);
  return (
    <section className="border-y border-white/10 bg-[#141416] py-20">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Amenities</p>
        <h2 className="landing-serif mt-4 mb-10 text-3xl text-white">Comfort & details</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {amenities.map((item) => (
            <li key={item.id} className="border border-white/10 px-5 py-4 text-white/80">
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const DAY_LABELS: Record<string, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export function LandingContact({ content }: { content: WebsiteContent }) {
  const { settings } = content;
  return (
    <section id="contact" className="bg-[#0B0B0C] py-24 lg:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-2 lg:px-8">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Visit us</p>
          <h2 className="landing-serif mt-4 text-3xl text-white lg:text-5xl">{settings.restaurantName}</h2>
          <p className="mt-6 text-white/70">{settings.address}</p>
          <p className="mt-2 text-white/70">{settings.phone}</p>
          <p className="mt-2 text-white/70">{settings.email}</p>
          {settings.googleMapsUrl ? (
            <a
              href={settings.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block text-sm text-[#C9A88B] hover:text-white"
            >
              Open in Google Maps →
            </a>
          ) : null}
          <div className="mt-10">
            <BookingCta size="lg" />
          </div>
        </div>
        <div>
          <h3 className="text-sm uppercase tracking-[0.2em] text-white/80">Opening hours</h3>
          <ul className="mt-6 space-y-3">
            {settings.openingHours.map((row) => (
              <li key={row.day} className="flex justify-between border-b border-white/10 pb-2 text-sm text-white/70">
                <span>{DAY_LABELS[row.day] ?? row.day}</span>
                <span>
                  {row.closed ? "Closed" : `${row.open} – ${row.close}`}
                  {row.note ? ` · ${row.note}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function LandingFooter({ content }: { content: WebsiteContent }) {
  const { settings } = content;
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
              {settings.instagramUrl ? (
                <li><a href={settings.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white">Instagram</a></li>
              ) : null}
            </ul>
          </div>
        </div>
        <p className="mt-12 text-xs text-white/35">© {new Date().getFullYear()} {settings.restaurantName}</p>
      </div>
    </footer>
  );
}
