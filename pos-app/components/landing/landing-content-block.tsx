"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { LandingImage } from "@/lib/website/landing-image";
import type { WebsiteBlockImage, WebsiteContentBlock } from "@/lib/website/types";

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
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function BlockCopy({
  block,
  tone = "default",
}: {
  block: WebsiteContentBlock;
  tone?: "default" | "overlay";
}) {
  const eyebrowClass =
    tone === "overlay" ? "text-[#E8D5C4]" : "text-[#C9A88B]";
  const titleClass = tone === "overlay" ? "text-white" : "text-white";
  const bodyClass = tone === "overlay" ? "text-white/85" : "text-white/65";

  return (
    <div>
      {block.eyebrow ? (
        <p className={`text-xs uppercase tracking-[0.3em] ${eyebrowClass}`}>{block.eyebrow}</p>
      ) : null}
      {block.title ? (
        <h3 className={`landing-serif mt-3 text-2xl lg:text-4xl ${titleClass}`}>{block.title}</h3>
      ) : null}
      {block.body ? (
        <p className={`mt-4 text-base leading-relaxed ${bodyClass}`}>{block.body}</p>
      ) : null}
      {block.ctaLabel && block.ctaHref ? (
        <div className="mt-8">
          <Link
            href={block.ctaHref}
            className="inline-flex border border-white/30 px-5 py-2.5 text-xs uppercase tracking-[0.22em] text-white transition hover:border-[#C9A88B] hover:text-[#C9A88B]"
          >
            {block.ctaLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function MediaFrame({
  image,
  className = "aspect-[4/3]",
  sizes,
  priority = false,
}: {
  image?: WebsiteBlockImage;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden bg-[#1a1a1c] ${className}`}>
      {image?.url ? (
        <LandingImage
          src={image.url}
          alt={image.alt || image.title || ""}
          fill
          sizes={sizes}
          quality={70}
          priority={priority}
          className="object-cover"
          style={{ objectPosition: image.objectPosition ?? "50% 50%" }}
        />
      ) : (
        <div className="flex h-full min-h-[160px] items-center justify-center text-sm text-white/30">
          Photo coming soon
        </div>
      )}
    </div>
  );
}

function CardFromImage({
  image,
  className = "",
}: {
  image: WebsiteBlockImage;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden border border-white/10 bg-[#121214] ${className}`}>
      <MediaFrame image={image} sizes="(max-width: 768px) 100vw, 33vw" />
      {(image.title || image.body || image.alt) && (
        <div className="p-5">
          {image.title ? (
            <h4 className="landing-serif text-xl text-white">{image.title}</h4>
          ) : image.alt ? (
            <h4 className="landing-serif text-xl text-white">{image.alt}</h4>
          ) : null}
          {image.body ? (
            <p className="mt-2 text-sm leading-relaxed text-white/60">{image.body}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SplitLayout({
  block,
  imageFirst,
}: {
  block: WebsiteContentBlock;
  imageFirst: boolean;
}) {
  const image = block.images[0];
  const media = (
    <MediaFrame image={image} className="aspect-[3/4] lg:aspect-[4/5]" sizes="(max-width: 1024px) 100vw, 50vw" />
  );
  const copy = <BlockCopy block={block} />;
  return (
    <Reveal className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      {imageFirst ? (
        <>
          {media}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {media}
        </>
      )}
    </Reveal>
  );
}

function StackLayout({
  block,
  imageFirst,
}: {
  block: WebsiteContentBlock;
  imageFirst: boolean;
}) {
  const image = block.images[0];
  const media = <MediaFrame image={image} className="aspect-[16/10]" sizes="100vw" />;
  const copy = <BlockCopy block={block} />;
  return (
    <Reveal className="mx-auto max-w-4xl space-y-8">
      {imageFirst ? (
        <>
          {media}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {media}
        </>
      )}
    </Reveal>
  );
}

function OverlayLayout({ block }: { block: WebsiteContentBlock }) {
  const image = block.images[0];
  return (
    <Reveal className="relative min-h-[420px] overflow-hidden lg:min-h-[560px]">
      <MediaFrame
        image={image}
        className="absolute inset-0 aspect-auto h-full min-h-[420px] lg:min-h-[560px]"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/20" />
      <div className="relative z-10 flex min-h-[420px] items-end p-8 lg:min-h-[560px] lg:p-14">
        <div className="max-w-2xl">
          <BlockCopy block={block} tone="overlay" />
        </div>
      </div>
    </Reveal>
  );
}

function ImageGridLayout({ block }: { block: WebsiteContentBlock }) {
  const images = block.images.length > 0 ? block.images : [];
  return (
    <Reveal className="space-y-8">
      {(block.eyebrow || block.title || block.body) && (
        <div className="max-w-2xl">
          <BlockCopy block={block} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((image) => (
          <MediaFrame
            key={image.id}
            image={image}
            className="aspect-[4/5]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ))}
      </div>
    </Reveal>
  );
}

function CardsLayout({
  block,
  columns,
}: {
  block: WebsiteContentBlock;
  columns: 2 | 3;
}) {
  const images = block.images;
  return (
    <Reveal className="space-y-10">
      {(block.eyebrow || block.title || block.body) && (
        <div className="max-w-2xl">
          <BlockCopy block={block} />
        </div>
      )}
      <div
        className={`grid gap-6 ${
          columns === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {images.map((image) => (
          <CardFromImage key={image.id} image={image} />
        ))}
      </div>
    </Reveal>
  );
}

function FeaturedSupportLayout({ block }: { block: WebsiteContentBlock }) {
  const [featured, ...rest] = block.images;
  return (
    <Reveal className="space-y-8">
      {(block.eyebrow || block.title || block.body) && !featured?.title ? (
        <div className="max-w-2xl">
          <BlockCopy block={block} />
        </div>
      ) : null}
      <div className="grid gap-6 md:grid-cols-3 md:items-start">
        {featured ? (
          <div className="overflow-hidden border border-white/10 bg-[#121214] md:col-span-2 md:grid md:grid-cols-2">
            <MediaFrame
              image={featured}
              className="aspect-[4/3] md:aspect-auto md:min-h-[280px] md:h-full"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            <div className="flex flex-col justify-center p-6 md:p-8">
              {block.eyebrow ? (
                <p className="text-xs uppercase tracking-[0.3em] text-[#C9A88B]">{block.eyebrow}</p>
              ) : null}
              <h3 className="landing-serif mt-2 text-2xl text-white lg:text-3xl">
                {featured.title || block.title || "Featured"}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                {featured.body || block.body}
              </p>
            </div>
          </div>
        ) : (
          <div className="md:col-span-2">
            <BlockCopy block={block} />
          </div>
        )}
        <div className="grid gap-6">
          {rest.map((image) => (
            <CardFromImage key={image.id} image={image} />
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/** Renders one reusable content component with its chosen layout. */
export function LandingContentBlock({ block }: { block: WebsiteContentBlock }) {
  if (!block.enabled) return null;

  switch (block.layout) {
    case "image_left_text_right":
      return <SplitLayout block={block} imageFirst />;
    case "text_left_image_right":
      return <SplitLayout block={block} imageFirst={false} />;
    case "image_top_text_bottom":
      return <StackLayout block={block} imageFirst />;
    case "text_top_image_bottom":
      return <StackLayout block={block} imageFirst={false} />;
    case "full_width_overlay":
      return <OverlayLayout block={block} />;
    case "image_grid":
      return <ImageGridLayout block={block} />;
    case "cards_2":
      return <CardsLayout block={block} columns={2} />;
    case "cards_3":
      return <CardsLayout block={block} columns={3} />;
    case "featured_support":
      return <FeaturedSupportLayout block={block} />;
    default:
      return <SplitLayout block={block} imageFirst />;
  }
}

export function LandingContentBlocks({
  blocks,
  className = "space-y-16 lg:space-y-24",
}: {
  blocks: WebsiteContentBlock[];
  className?: string;
}) {
  const visible = blocks.filter((block) => block.enabled);
  if (visible.length === 0) return null;
  return (
    <div className={className}>
      {visible.map((block) => (
        <LandingContentBlock key={block.id} block={block} />
      ))}
    </div>
  );
}
