"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BookingCta } from "@/components/landing/booking-cta";
import {
  responsiveBodyClass,
  responsiveHeadlineClass,
} from "@/lib/website/page-layout";
import type { WebsiteContent, WebsitePageSection } from "@/lib/website/types";

function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function LandingAbout({ content }: { content: WebsiteContent }) {
  const aboutImage = content.media.about_image?.fileUrl;
  return (
    <section id="about" className="bg-[#0F0F10] py-24 lg:py-32">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-2 lg:gap-20 lg:px-8">
        <Reveal className="relative aspect-[3/4] overflow-hidden bg-[#1a1a1c]">
          {aboutImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={aboutImage}
              alt="Restaurant interior"
              className="h-full w-full object-cover"
              style={{ objectPosition: content.media.about_image?.objectPosition ?? "50% 50%" }}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#2a1518] to-[#111]" >
              <span className="px-6 text-center text-sm text-white/40">Upload about image in /admin</span>
            </div>
          )}
        </Reveal>
        <Reveal>
          <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Our story</p>
          <h2 className="landing-serif mt-4 text-3xl text-white lg:text-5xl">
            {content.settings.tagline || "The Korean BBQ ritual"}
          </h2>
          <p className="mt-6 text-base leading-relaxed text-white/70">{content.settings.aboutStory}</p>
          <p className="mt-4 text-base leading-relaxed text-white/60">{content.settings.description}</p>
          <div className="mt-10">
            <BookingCta variant="outline" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function LandingSignature({ content }: { content: WebsiteContent }) {
  const featured = content.menuItems.filter((item) => item.featured && item.available).slice(0, 3);
  const signatureAssets = [
    content.media.signature_1,
    content.media.signature_2,
    content.media.signature_3,
  ];

  return (
    <section className="bg-[#0B0B0C] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal className="mb-14 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Signature</p>
          <h2 className="landing-serif mt-4 text-3xl text-white lg:text-5xl">Fire & flavour</h2>
          <p className="mt-4 text-white/65">
            Premium cuts and Korean classics — grilled at your table in an immersive setting.
          </p>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-3">
          {featured.map((item, index) => (
            <Reveal key={item.id} className="group overflow-hidden border border-white/10 bg-[#121214]">
              <div className="aspect-square overflow-hidden bg-[#1a1a1c]">
                {item.imageUrl || signatureAssets[index]?.fileUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl || signatureAssets[index]?.fileUrl}
                    alt={item.name}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    style={{
                      objectPosition: signatureAssets[index]?.objectPosition ?? "50% 50%",
                    }}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/30">Photo coming soon</div>
                )}
              </div>
              <div className="p-6">
                {item.badge ? (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#C9A88B]">{item.badge}</span>
                ) : null}
                <h3 className="landing-serif mt-2 text-2xl text-white">{item.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{item.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingExperience({ section }: { section?: WebsitePageSection }) {
  const eyebrow = section?.props?.eyebrow || "Experience";
  const headline = section?.props?.headline || "Korean BBQ, reimagined for Prague";
  const headlineClass = section
    ? responsiveHeadlineClass(section)
    : "text-3xl lg:text-5xl";

  return (
    <section className="relative overflow-hidden bg-[#141416] py-24 lg:py-32">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(139,30,45,0.25),transparent_50%)]" />
      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <Reveal className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">{eyebrow}</p>
          <h2 className={`landing-serif mt-4 text-white ${headlineClass}`}>{headline}</h2>
          {section?.props?.body ? (
            <p className={`mt-4 text-white/65 ${responsiveBodyClass(section)}`}>
              {section.props.body}
            </p>
          ) : null}
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {[
              { title: "Tableside grilling", body: "Premium cuts prepared at your table with charcoal warmth and attentive service." },
              { title: "Refined banchan", body: "House side dishes and Korean accompaniments designed to complement every bite." },
              { title: "Evening atmosphere", body: "Cinematic lighting, editorial plating, and a hospitality-first dining rhythm." },
            ].map((item) => (
              <div key={item.title} className="border-t border-white/15 pt-6">
                <h3 className="text-lg font-medium text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{item.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
