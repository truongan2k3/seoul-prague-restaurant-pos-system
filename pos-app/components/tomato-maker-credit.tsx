import type { ReactNode } from "react";

export const TOMATO_PARTNERSHIP_EMAIL = "nguyenandy2k3@gmail.com";

export const TOMATO_TAGLINE_VI =
  "Từ một ý tưởng, chúng tôi biến nó trở thành sản phẩm phù hợp nhất với bạn";

export const TOMATO_TAGLINE_EN =
  "From an idea, we turn it into the product that fits you best";

/** Shared maker credit — bilingual VI/EN, English-only signature line. */
export function TomatoMakerCredit({
  variant = "dark",
  className = "",
}: {
  variant?: "dark" | "light";
  className?: string;
}) {
  const muted = variant === "dark" ? "text-white/55" : "text-stone-500 dark:text-zinc-400";
  const body = variant === "dark" ? "text-white/80" : "text-stone-700 dark:text-zinc-200";
  const link =
    variant === "dark"
      ? "text-[#C9A88B] hover:text-[#E2C4A8]"
      : "text-rose-700 hover:text-rose-800 dark:text-rose-300 dark:hover:text-rose-200";

  return (
    <div className={`space-y-4 text-center ${className}`}>
      <div className="space-y-1.5">
        <p className={`text-sm leading-relaxed sm:text-[15px] ${body}`}>{TOMATO_TAGLINE_VI}</p>
        <p className={`text-sm leading-relaxed sm:text-[15px] ${muted}`}>{TOMATO_TAGLINE_EN}</p>
      </div>
      <div className="space-y-1">
        <p className={`text-xs uppercase tracking-[0.18em] ${muted}`}>
          Liên hệ hợp tác · Partnership
        </p>
        <a
          href={`mailto:${TOMATO_PARTNERSHIP_EMAIL}`}
          className={`inline-block text-sm font-medium underline-offset-4 hover:underline ${link}`}
        >
          {TOMATO_PARTNERSHIP_EMAIL}
        </a>
      </div>
      <p className={`pt-1 text-sm ${body}`}>
        Made by tomato 🍅 with love 🇻🇳
      </p>
    </div>
  );
}

export function TomatoAboutPanel({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center px-6 py-10">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-stone-900 dark:text-zinc-50">
        {title}
      </h1>
      <div className="mt-8 rounded-2xl border border-stone-200/80 bg-white/70 px-6 py-8 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/60">
        <TomatoMakerCredit variant="light" />
      </div>
      {children}
    </div>
  );
}
