"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { LandingImage } from "@/lib/website/landing-image";
import type { WebsiteBlockImage, WebsiteContentBlock, WebsiteContentLayout } from "@/lib/website/types";

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
  const eyebrowClass = tone === "overlay" ? "text-[#E8D5C4]" : "text-[#C9A88B]";
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

function DishCopy({
  image,
  fallback,
  compact = false,
}: {
  image: WebsiteBlockImage;
  fallback?: Pick<WebsiteContentBlock, "eyebrow" | "title" | "body" | "ctaLabel" | "ctaHref">;
  compact?: boolean;
}) {
  const badge = image.badge || fallback?.eyebrow;
  const title = image.title || image.alt || fallback?.title || "Featured";
  const body = image.body || fallback?.body;
  const price = image.price;
  const ctaLabel = image.ctaLabel || fallback?.ctaLabel;
  const ctaHref = image.ctaHref || fallback?.ctaHref;

  return (
    <div className={compact ? "flex min-h-0 flex-1 flex-col" : ""}>
      {badge ? (
        <p className="text-[11px] uppercase tracking-[0.28em] text-[#C9A88B]">{badge}</p>
      ) : null}
      <h3
        className={`landing-serif text-white ${
          compact ? "mt-2 text-xl lg:text-2xl" : "mt-2 text-2xl lg:text-3xl"
        }`}
      >
        {title}
      </h3>
      {body ? (
        <p
          className={`mt-3 leading-relaxed text-white/60 ${
            compact ? "line-clamp-4 text-sm" : "text-sm sm:text-base"
          }`}
        >
          {body}
        </p>
      ) : null}
      {(price || (ctaLabel && ctaHref)) && (
        <div className={`mt-auto flex flex-wrap items-center gap-4 ${compact ? "pt-4" : "pt-5"}`}>
          {price ? <p className="text-sm font-medium tracking-wide text-[#E8D5C4]">{price}</p> : null}
          {ctaLabel && ctaHref ? (
            <Link
              href={ctaHref}
              className="inline-flex border border-white/25 px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-white/90 transition hover:border-[#C9A88B] hover:text-[#C9A88B]"
            >
              {ctaLabel}
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** Equal-height dish card — image top, copy bottom. Stable on all breakpoints. */
export function SignatureDishCard({
  image,
  fallback,
  className = "",
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  image: WebsiteBlockImage;
  fallback?: Pick<WebsiteContentBlock, "eyebrow" | "title" | "body" | "ctaLabel" | "ctaHref">;
  className?: string;
  sizes?: string;
}) {
  return (
    <article
      className={`flex h-full min-w-0 flex-col overflow-hidden border border-white/10 bg-[#121214] ${className}`}
    >
      <MediaFrame image={image} className="aspect-[4/3] w-full shrink-0" sizes={sizes} />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <DishCopy image={image} fallback={fallback} compact />
      </div>
    </article>
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
    <MediaFrame
      image={image}
      className="aspect-[4/5] w-full lg:aspect-[4/5]"
      sizes="(max-width: 1024px) 100vw, 50vw"
    />
  );
  const copy =
    image && (image.title || image.body || image.badge || image.price) ? (
      <DishCopy image={image} fallback={block} />
    ) : (
      <BlockCopy block={block} />
    );
  return (
    <Reveal className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
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
  const copy =
    image && (image.title || image.body || image.badge || image.price) ? (
      <DishCopy image={image} fallback={block} />
    ) : (
      <BlockCopy block={block} />
    );
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
          {image && (image.title || image.badge) ? (
            <DishCopy image={image} fallback={block} />
          ) : (
            <BlockCopy block={block} tone="overlay" />
          )}
        </div>
      </div>
    </Reveal>
  );
}

function ImageGridLayout({ block }: { block: WebsiteContentBlock }) {
  const images = block.images.filter((img) => img.enabled !== false);
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
  const images = block.images.filter((img) => img.enabled !== false);
  return (
    <Reveal className="space-y-10">
      {(block.eyebrow || block.title || block.body) &&
      !(images.length > 0 && images.some((img) => img.title)) ? (
        <div className="max-w-2xl">
          <BlockCopy block={block} />
        </div>
      ) : null}
      <div
        className={`grid auto-rows-fr gap-5 sm:gap-6 ${
          columns === 2
            ? "sm:grid-cols-2"
            : "sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {images.map((image) => (
          <SignatureDishCard
            key={image.id}
            image={image}
            fallback={block}
            sizes={
              columns === 2
                ? "(max-width: 640px) 100vw, 50vw"
                : "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            }
          />
        ))}
      </div>
    </Reveal>
  );
}

/**
 * Featured large dish + supporting cards.
 * Desktop: featured spans 2 cols / 2 rows so height matches the first two support cards.
 * Extra dishes wrap into an equal card row below. Mobile: uniform stacked cards.
 */
function FeaturedSupportLayout({ block }: { block: WebsiteContentBlock }) {
  const images = block.images.filter((img) => img.enabled !== false);
  const [featured, ...rest] = images;
  const side = rest.slice(0, 2);
  const overflow = rest.slice(2);

  if (!featured) {
    return (
      <Reveal>
        <BlockCopy block={block} />
      </Reveal>
    );
  }

  // Mobile / tablet: equal cards — avoids the broken desktop asymmetry when scaled down.
  return (
    <Reveal className="space-y-6">
      {(block.eyebrow || block.title || block.body) && !featured.title ? (
        <div className="max-w-2xl">
          <BlockCopy block={block} />
        </div>
      ) : null}

      {/* < lg: equal card stack / 2-col */}
      <div className="grid auto-rows-fr gap-5 sm:grid-cols-2 sm:gap-6 lg:hidden">
        {images.map((image) => (
          <SignatureDishCard key={image.id} image={image} fallback={block} />
        ))}
      </div>

      {/* lg+: featured + up to 2 support, stretched */}
      <div
        className={`hidden lg:grid lg:gap-6 ${
          side.length === 0
            ? "lg:grid-cols-1"
            : "lg:grid-cols-3 lg:grid-rows-2"
        }`}
      >
        <article
          className={`flex min-h-0 flex-col overflow-hidden border border-white/10 bg-[#121214] lg:flex-row ${
            side.length === 0 ? "min-h-[320px]" : "lg:col-span-2 lg:row-span-2"
          }`}
        >
          <div
            className={`relative min-h-[280px] w-full shrink-0 ${
              side.length === 0 ? "lg:w-[48%]" : "lg:h-full lg:w-[52%]"
            }`}
          >
            <MediaFrame
              image={featured}
              className="absolute inset-0 aspect-auto h-full w-full"
              sizes="(max-width: 1280px) 55vw, 40vw"
            />
          </div>
          <div className="flex flex-1 flex-col justify-center p-7 xl:p-10">
            <DishCopy image={featured} fallback={block} />
          </div>
        </article>
        {side.map((image) => (
          <SignatureDishCard
            key={image.id}
            image={image}
            fallback={block}
            className="min-h-0"
            sizes="(max-width: 1280px) 30vw, 22vw"
          />
        ))}
        {side.length === 1 ? <div className="hidden min-h-0 lg:block" aria-hidden /> : null}
      </div>

      {overflow.length > 0 ? (
        <div className="hidden auto-rows-fr gap-6 sm:grid-cols-2 lg:grid lg:grid-cols-3">
          {overflow.map((image) => (
            <SignatureDishCard key={image.id} image={image} fallback={block} />
          ))}
        </div>
      ) : null}
    </Reveal>
  );
}

/** Renders a Signature dish collection with a chosen layout. */
export function SignatureDishCollection({
  dishes,
  layout,
  fallback,
}: {
  dishes: WebsiteBlockImage[];
  layout: WebsiteContentLayout;
  fallback?: Pick<WebsiteContentBlock, "eyebrow" | "title" | "body" | "ctaLabel" | "ctaHref">;
}) {
  const visible = dishes.filter((d) => d.enabled !== false);
  if (visible.length === 0) return null;

  const block: WebsiteContentBlock = {
    id: "signature-collection",
    enabled: true,
    sortOrder: 0,
    layout,
    eyebrow: fallback?.eyebrow,
    title: fallback?.title,
    body: fallback?.body,
    ctaLabel: fallback?.ctaLabel,
    ctaHref: fallback?.ctaHref,
    images: visible,
  };

  switch (layout) {
    case "image_left_text_right":
      return (
        <div className="space-y-14 lg:space-y-20">
          {visible.map((image) => (
            <SplitLayout
              key={image.id}
              block={{ ...block, images: [image], title: image.title, body: image.body, eyebrow: image.badge }}
              imageFirst
            />
          ))}
        </div>
      );
    case "text_left_image_right":
      return (
        <div className="space-y-14 lg:space-y-20">
          {visible.map((image) => (
            <SplitLayout
              key={image.id}
              block={{ ...block, images: [image], title: image.title, body: image.body, eyebrow: image.badge }}
              imageFirst={false}
            />
          ))}
        </div>
      );
    case "image_top_text_bottom":
      return (
        <div className="space-y-12 lg:space-y-16">
          {visible.map((image) => (
            <StackLayout
              key={image.id}
              block={{ ...block, images: [image], title: image.title, body: image.body, eyebrow: image.badge }}
              imageFirst
            />
          ))}
        </div>
      );
    case "text_top_image_bottom":
      return (
        <div className="space-y-12 lg:space-y-16">
          {visible.map((image) => (
            <StackLayout
              key={image.id}
              block={{ ...block, images: [image], title: image.title, body: image.body, eyebrow: image.badge }}
              imageFirst={false}
            />
          ))}
        </div>
      );
    case "full_width_overlay":
      return (
        <div className="space-y-8">
          {visible.map((image) => (
            <OverlayLayout
              key={image.id}
              block={{ ...block, images: [image], title: image.title, body: image.body, eyebrow: image.badge }}
            />
          ))}
        </div>
      );
    case "image_grid":
      return <ImageGridLayout block={block} />;
    case "cards_2":
      return <CardsLayout block={block} columns={2} />;
    case "cards_3":
      return <CardsLayout block={block} columns={3} />;
    case "featured_support":
      return <FeaturedSupportLayout block={block} />;
    default:
      return <CardsLayout block={block} columns={3} />;
  }
}

/** Renders one reusable content component with its chosen layout. */
export function LandingContentBlock({ block }: { block: WebsiteContentBlock }) {
  if (!block.enabled) return null;

  const images = block.images.filter((img) => img.enabled !== false);
  const dishLike =
    images.length > 1 ||
    Boolean(images[0]?.badge || images[0]?.price || images[0]?.title);

  // Multi-image blocks always use the collection renderer for stable grids.
  if (images.length > 1 || block.layout === "cards_2" || block.layout === "cards_3" || block.layout === "featured_support") {
    return <SignatureDishCollection dishes={images} layout={block.layout} fallback={block} />;
  }

  switch (block.layout) {
    case "image_left_text_right":
      return <SplitLayout block={block} imageFirst />;
    case "text_left_image_right":
      return <SplitLayout block={block} imageFirst={false} />;
    case "image_top_text_bottom":
      return dishLike && images[0] ? (
        <SignatureDishCollection dishes={images} layout={block.layout} fallback={block} />
      ) : (
        <StackLayout block={block} imageFirst />
      );
    case "text_top_image_bottom":
      return <StackLayout block={block} imageFirst={false} />;
    case "full_width_overlay":
      return <OverlayLayout block={block} />;
    case "image_grid":
      return <ImageGridLayout block={block} />;
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
