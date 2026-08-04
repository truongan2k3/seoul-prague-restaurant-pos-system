"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useFullscreen } from "@/hooks/use-fullscreen";

interface FullscreenToggleProps {
  compact?: boolean;
}

export function FullscreenToggle({ compact = false }: FullscreenToggleProps) {
  const { translate } = useApp();
  const { isFullscreen, supported, toggle } = useFullscreen();

  if (!supported) return null;

  const label = isFullscreen ? translate("exitFullscreen") : translate("fullscreen");

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      title={label}
      aria-label={label}
      className={`flex min-h-[44px] w-full items-center rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 ${
        compact ? "justify-center px-2 py-2" : "gap-2 px-3 py-2"
      }`}
    >
      {isFullscreen ? (
        <Minimize2 className="h-4 w-4 shrink-0" />
      ) : (
        <Maximize2 className="h-4 w-4 shrink-0" />
      )}
      {!compact && <span>{label}</span>}
    </button>
  );
}
