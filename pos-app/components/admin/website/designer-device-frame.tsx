"use client";

import type { WebsiteDevice } from "@/lib/website/types";

export function DesignerDeviceFrame({
  device,
  children,
  zoom = 100,
}: {
  device: WebsiteDevice;
  children: React.ReactNode;
  zoom?: number;
}) {
  const scale = zoom / 100;

  if (device === "mobile") {
    return (
      <div
        className="mx-auto origin-top transition-transform duration-200"
        style={{ transform: `scale(${scale})` }}
      >
        <div className="relative w-[390px] rounded-[2.75rem] bg-[#1c1c1e] p-[10px] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.08)]">
          {/* Side buttons */}
          <div className="absolute -left-[3px] top-28 h-8 w-[3px] rounded-l bg-[#2a2a2c]" />
          <div className="absolute -left-[3px] top-40 h-14 w-[3px] rounded-l bg-[#2a2a2c]" />
          <div className="absolute -left-[3px] top-56 h-14 w-[3px] rounded-l bg-[#2a2a2c]" />
          <div className="absolute -right-[3px] top-44 h-20 w-[3px] rounded-r bg-[#2a2a2c]" />

          <div className="relative overflow-hidden rounded-[2.2rem] bg-[#0B0B0C]">
            {/* Dynamic Island */}
            <div className="pointer-events-none absolute left-1/2 top-3 z-30 h-[28px] w-[118px] -translate-x-1/2 rounded-full bg-black shadow-inner" />
            {/* Status bar */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-11 items-end justify-between px-7 pb-1 text-[11px] font-semibold text-white/90">
              <span>9:41</span>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded-sm border border-white/80">
                  <span className="ml-[1px] mt-[1px] block h-[5px] w-[10px] rounded-[1px] bg-white/90" />
                </span>
              </div>
            </div>

            <div className="max-h-[760px] min-h-[700px] overflow-y-auto overflow-x-hidden pt-11 text-white [scrollbar-width:thin]">
              {children}
            </div>

            {/* Home indicator */}
            <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 flex justify-center">
              <div className="h-[4px] w-[120px] rounded-full bg-white/35" />
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-gray-500">
          iPhone · 390 × 844
        </p>
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-[1280px] origin-top transition-transform duration-200"
      style={{ transform: `scale(${scale})`, width: `${100 / scale}%`, maxWidth: 1280 / scale }}
    >
      <div className="overflow-hidden rounded-xl border border-black/15 bg-[#0B0B0C] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.55)] dark:border-white/10">
        {/* Browser chrome */}
        <div className="flex items-center gap-3 border-b border-white/10 bg-[#2a2a2e] px-3 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="mx-auto flex h-7 w-full max-w-xl items-center gap-2 rounded-md bg-[#1c1c1f] px-3 text-xs text-white/55 ring-1 ring-white/10">
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/25 text-[8px]">
              🔒
            </span>
            <span className="truncate">seoulprague.com</span>
          </div>
          <div className="w-14" />
        </div>
        <div className="max-h-[calc(100vh-11rem)] min-h-[640px] overflow-y-auto overflow-x-hidden text-white [scrollbar-width:thin]">
          {children}
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-gray-500">
        Desktop browser · 1280px canvas
      </p>
    </div>
  );
}
