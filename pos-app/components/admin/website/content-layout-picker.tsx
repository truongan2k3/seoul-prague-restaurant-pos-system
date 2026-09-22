"use client";

import { CONTENT_LAYOUTS, SIGNATURE_COLLECTION_LAYOUTS } from "@/lib/website/page-layout";
import type { WebsiteContentLayout } from "@/lib/website/types";

function LayoutGlyph({ kind }: { kind: (typeof CONTENT_LAYOUTS)[number]["preview"] }) {
  const cell = "rounded-[2px] bg-current/25";
  const solid = "rounded-[2px] bg-current/55";
  switch (kind) {
    case "split-ltr":
      return (
        <div className="grid h-full grid-cols-2 gap-1 p-1.5">
          <div className={solid} />
          <div className={`flex flex-col gap-1`}>
            <div className={`${cell} h-2 w-3/4`} />
            <div className={`${cell} h-1.5 w-full`} />
            <div className={`${cell} h-1.5 w-5/6`} />
          </div>
        </div>
      );
    case "split-rtl":
      return (
        <div className="grid h-full grid-cols-2 gap-1 p-1.5">
          <div className="flex flex-col gap-1">
            <div className={`${cell} h-2 w-3/4`} />
            <div className={`${cell} h-1.5 w-full`} />
            <div className={`${cell} h-1.5 w-5/6`} />
          </div>
          <div className={solid} />
        </div>
      );
    case "stack-itb":
      return (
        <div className="flex h-full flex-col gap-1 p-1.5">
          <div className={`${solid} flex-[1.4]`} />
          <div className={`${cell} h-2 w-2/3`} />
          <div className={`${cell} h-1.5 w-full`} />
        </div>
      );
    case "stack-tib":
      return (
        <div className="flex h-full flex-col gap-1 p-1.5">
          <div className={`${cell} h-2 w-2/3`} />
          <div className={`${cell} h-1.5 w-full`} />
          <div className={`${solid} flex-[1.4]`} />
        </div>
      );
    case "overlay":
      return (
        <div className={`relative h-full p-1.5`}>
          <div className={`${solid} h-full w-full`} />
          <div className="absolute bottom-2.5 left-2.5 right-2.5 space-y-1">
            <div className="h-1.5 w-1/2 rounded-[2px] bg-white/70" />
            <div className="h-1 w-full rounded-[2px] bg-white/40" />
          </div>
        </div>
      );
    case "grid":
      return (
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-1 p-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={solid} />
          ))}
        </div>
      );
    case "cards-2":
      return (
        <div className="grid h-full grid-cols-2 gap-1 p-1.5">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className={`${solid} flex-1`} />
              <div className={`${cell} h-1.5`} />
            </div>
          ))}
        </div>
      );
    case "cards-3":
      return (
        <div className="grid h-full grid-cols-3 gap-1 p-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className={`${solid} flex-1`} />
              <div className={`${cell} h-1.5`} />
            </div>
          ))}
        </div>
      );
    case "featured":
      return (
        <div className="grid h-full grid-cols-3 grid-rows-2 gap-1 p-1.5">
          <div className={`${solid} col-span-2 row-span-2`} />
          <div className="flex flex-col gap-1">
            <div className={`${solid} flex-1`} />
            <div className={`${cell} h-1`} />
          </div>
          <div className="flex flex-col gap-1">
            <div className={`${solid} flex-1`} />
            <div className={`${cell} h-1`} />
          </div>
        </div>
      );
    default:
      return <div className={`${solid} m-1.5 h-[calc(100%-0.75rem)]`} />;
  }
}

export function ContentLayoutPicker({
  value,
  onChange,
  allowedIds,
  className = "",
}: {
  value: WebsiteContentLayout;
  onChange: (next: WebsiteContentLayout) => void;
  allowedIds?: WebsiteContentLayout[];
  className?: string;
}) {
  const options = CONTENT_LAYOUTS.filter((row) =>
    allowedIds ? allowedIds.includes(row.id) : true,
  );

  return (
    <div className={`grid gap-2 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {options.map((layout) => {
        const active = value === layout.id;
        return (
          <button
            key={layout.id}
            type="button"
            onClick={() => onChange(layout.id)}
            className={`rounded-xl border p-2 text-left transition ${
              active
                ? "border-[#C9A88B] bg-[#C9A88B]/10 ring-2 ring-[#C9A88B]/40"
                : "border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600"
            }`}
          >
            <div
              className={`mb-2 h-16 w-full overflow-hidden rounded-lg ${
                active ? "text-[#8B6914]" : "text-gray-500 dark:text-gray-400"
              } bg-gray-100 dark:bg-gray-800`}
            >
              <LayoutGlyph kind={layout.preview} />
            </div>
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{layout.label}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{layout.hint}</p>
          </button>
        );
      })}
    </div>
  );
}

export function SignatureLayoutPicker(props: {
  value: WebsiteContentLayout;
  onChange: (next: WebsiteContentLayout) => void;
}) {
  return (
    <ContentLayoutPicker
      value={props.value}
      onChange={props.onChange}
      allowedIds={SIGNATURE_COLLECTION_LAYOUTS}
    />
  );
}
