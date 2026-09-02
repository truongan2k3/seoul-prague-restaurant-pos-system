import Link from "next/link";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-menu-gallery";
import { BookingCta } from "@/components/landing/booking-cta";
import { MenuPdfFlipbook } from "@/components/landing/menu-pdf-flipbook";
import type { WebsiteContent } from "@/lib/website/types";

function formatPrice(price: number | null, currency: string): string {
  if (price == null) return "Price on request";
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency }).format(price);
}

export function LandingMenuPageView({ content }: { content: WebsiteContent }) {
  const hasPdfs = content.menuPdfs.length > 0;
  const categories = content.menuCategories.filter((cat) => cat.enabled);
  const items = content.menuItems.filter((item) => item.available);

  return (
    <div className="landing-theme min-h-screen bg-[#0B0B0C] text-white">
      <LandingNavbar content={content} />
      <main className="pb-24 pt-28 lg:pb-16">
        <div className="mx-auto max-w-7xl px-5 lg:px-8">
          <Link href="/landing" className="text-sm text-[#C9A88B] hover:text-white">← Back to home</Link>
          <p className="mt-8 text-xs uppercase tracking-[0.3em] text-[#C9A88B]">Menu</p>
          <h1 className="landing-serif mt-4 text-4xl lg:text-6xl">Our menu</h1>
          <p className="mt-4 max-w-2xl text-white/60">
            {hasPdfs
              ? "Browse our menu like a book — choose Czech, English, or Chinese."
              : "Digital menu highlights below. Upload PDF menus in /admin for the flipbook experience."}
          </p>

          <div className="mt-12">
            <MenuPdfFlipbook pdfs={content.menuPdfs} />
          </div>

          {!hasPdfs ? (
            <div className="mt-20 space-y-16">
              {categories.map((category) => {
                const categoryItems = items.filter((item) => item.categoryId === category.id);
                if (categoryItems.length === 0) return null;
                return (
                  <section key={category.id} id={category.slug}>
                    <h2 className="border-b border-white/15 pb-4 text-sm uppercase tracking-[0.24em] text-white/85">
                      {category.name}
                    </h2>
                    <ul className="mt-6 divide-y divide-white/10">
                      {categoryItems.map((item) => (
                        <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 py-6">
                          <div className="flex min-w-0 flex-1 gap-4">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.imageUrl} alt={item.name} className="h-24 w-24 object-cover" />
                            ) : null}
                            <div>
                              <h3 className="text-lg font-medium text-white">{item.name}</h3>
                              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">{item.description}</p>
                            </div>
                          </div>
                          <span className="text-sm font-medium text-[#C9A88B]">
                            {formatPrice(item.price, item.currency)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : null}

          <div className="mt-20 text-center">
            <BookingCta size="lg" />
          </div>
        </div>
      </main>
      <LandingFooter content={content} />
    </div>
  );
}
