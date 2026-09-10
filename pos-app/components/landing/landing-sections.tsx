"use client";

import { motion, useReducedMotion } from "framer-motion";
import { BookingCta } from "@/components/landing/booking-cta";
import { LandingContentBlocks } from "@/components/landing/landing-content-block";
import { LandingImage } from "@/lib/website/landing-image";
import {
  createBlockImage,
  createContentBlock,
  enabledContentBlocks,
  responsiveBodyClass,
  responsiveHeadlineClass,
} from "@/lib/website/page-layout";
import type { WebsiteContent, WebsiteContentBlock, WebsitePageSection } from "@/lib/website/types";

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

function SectionIntro({
  eyebrow,
  headline,
  body,
  headlineClass,
  bodyClass,
}: {
  eyebrow?: string;
  headline?: string;
  body?: string;
  headlineClass?: string;
  bodyClass?: string;
}) {
  if (!eyebrow && !headline && !body) return null;
  return (
    <Reveal className="mb-14 max-w-2xl">
      {eyebrow ? (
        <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">{eyebrow}</p>
      ) : null}
      {headline ? (
        <h2 className={`landing-serif mt-4 text-white ${headlineClass ?? "text-3xl lg:text-5xl"}`}>
          {headline}
        </h2>
      ) : null}
      {body ? (
        <p className={`mt-4 text-white/65 ${bodyClass ?? ""}`}>{body}</p>
      ) : null}
    </Reveal>
  );
}

/** Legacy About when no content blocks are configured. */
function LegacyAbout({ content }: { content: WebsiteContent }) {
  const aboutImage = content.media.about_image?.fileUrl;
  return (
    <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 lg:grid-cols-2 lg:gap-20 lg:px-8">
      <Reveal className="relative aspect-[3/4] overflow-hidden bg-[#1a1a1c]">
        {aboutImage ? (
          <LandingImage
            src={aboutImage}
            alt="Restaurant interior"
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            quality={72}
            className="object-cover"
            style={{ objectPosition: content.media.about_image?.objectPosition ?? "50% 50%" }}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#2a1518] to-[#111]">
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
  );
}

export function LandingAbout({
  content,
  section,
}: {
  content: WebsiteContent;
  section?: WebsitePageSection;
}) {
  const blocks = enabledContentBlocks(section);
  return (
    <section id="about" className="bg-[#0F0F10] py-24 lg:py-32">
      {blocks.length > 0 ? (
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <SectionIntro
            eyebrow={section?.props?.eyebrow}
            headline={section?.props?.headline}
            body={section?.props?.body}
            headlineClass={section ? responsiveHeadlineClass(section) : undefined}
            bodyClass={section ? responsiveBodyClass(section) : undefined}
          />
          <LandingContentBlocks blocks={blocks} />
        </div>
      ) : (
        <LegacyAbout content={content} />
      )}
    </section>
  );
}

function signatureFallbackBlocks(content: WebsiteContent): WebsiteContentBlock[] {
  const featured = content.menuItems.filter((item) => item.featured && item.available).slice(0, 6);
  const signatureAssets = [
    content.media.signature_1,
    content.media.signature_2,
    content.media.signature_3,
  ];
  if (featured.length === 0) return [];

  const images = featured.map((item, index) => {
    const asset = signatureAssets[index % signatureAssets.length];
    return createBlockImage({
      id: `sig-${item.id}`,
      url: item.imageUrl || asset?.fileUrl || "",
      alt: item.name,
      title: item.name,
      body: item.description,
      objectPosition: asset?.objectPosition ?? "50% 50%",
      sortOrder: index,
    });
  });

  return [
    createContentBlock("featured_support", {
      id: "signature-legacy",
      eyebrow: "",
      title: "",
      body: "",
      images,
    }),
  ];
}

export function LandingSignature({
  content,
  section,
}: {
  content: WebsiteContent;
  section?: WebsitePageSection;
}) {
  const configured = enabledContentBlocks(section);
  const blocks = configured.length > 0 ? configured : signatureFallbackBlocks(content);
  const eyebrow = section?.props?.eyebrow || "Signature";
  const headline = section?.props?.headline || "Fire & flavour";
  const body =
    section?.props?.body ||
    "Premium cuts and Korean classics — grilled at your table in an immersive setting.";

  return (
    <section className="bg-[#0B0B0C] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionIntro
          eyebrow={eyebrow}
          headline={headline}
          body={body}
          headlineClass={section ? responsiveHeadlineClass(section) : "text-3xl lg:text-5xl"}
          bodyClass={section ? responsiveBodyClass(section) : undefined}
        />
        {blocks.length > 0 ? (
          <LandingContentBlocks blocks={blocks} />
        ) : (
          <p className="text-sm text-white/40">
            Add Signature components in Admin → Sections, or mark menu items as featured.
          </p>
        )}
      </div>
    </section>
  );
}

export function LandingExperience({ section }: { section?: WebsitePageSection }) {
  const blocks = enabledContentBlocks(section);
  const eyebrow = section?.props?.eyebrow || "Experience";
  const headline = section?.props?.headline || "Korean BBQ, reimagined for Prague";
  const headlineClass = section
    ? responsiveHeadlineClass(section)
    : "text-3xl lg:text-5xl";

  return (
    <section className="relative overflow-hidden bg-[#141416] py-24 lg:py-32">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(139,30,45,0.25),transparent_50%)]" />
      <div className="relative mx-auto max-w-7xl px-5 lg:px-8">
        <SectionIntro
          eyebrow={eyebrow}
          headline={headline}
          body={section?.props?.body}
          headlineClass={headlineClass}
          bodyClass={section ? responsiveBodyClass(section) : undefined}
        />
        {blocks.length > 0 ? (
          <LandingContentBlocks blocks={blocks} />
        ) : (
          <Reveal>
            <div className="mt-2 grid gap-8 sm:grid-cols-3">
              {[
                {
                  title: "Tableside grilling",
                  body: "Premium cuts prepared at your table with charcoal warmth and attentive service.",
                },
                {
                  title: "Refined banchan",
                  body: "House side dishes and Korean accompaniments designed to complement every bite.",
                },
                {
                  title: "Evening atmosphere",
                  body: "Cinematic lighting, editorial plating, and a hospitality-first dining rhythm.",
                },
              ].map((item) => (
                <div key={item.title} className="border-t border-white/15 pt-6">
                  <h3 className="text-lg font-medium text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/60">{item.body}</p>
                </div>
              ))}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/** Freeform multi-component section driven entirely by blocks. */
export function LandingContentSection({ section }: { section: WebsitePageSection }) {
  const blocks = enabledContentBlocks(section);
  return (
    <section className="bg-[#0F0F10] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <SectionIntro
          eyebrow={section.props?.eyebrow}
          headline={section.props?.headline}
          body={section.props?.body}
          headlineClass={responsiveHeadlineClass(section)}
          bodyClass={responsiveBodyClass(section)}
        />
        <LandingContentBlocks blocks={blocks} />
      </div>
    </section>
  );
}
