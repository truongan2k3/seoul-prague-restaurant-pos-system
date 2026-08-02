"use client";

import type { OrderItem } from "@/lib/types";

interface WaiterNoteDisplayProps {
  notes?: string;
  notesTranslated?: string;
  className?: string;
}

/** KDS / Bar: Chinese translation prominent; original English below when different. */
export function WaiterNoteDisplay({
  notes,
  notesTranslated,
  className = "",
}: WaiterNoteDisplayProps) {
  if (!notes && !notesTranslated) return null;

  const original = notes?.trim();
  const translated = notesTranslated?.trim();
  const showBoth =
    Boolean(original) &&
    Boolean(translated) &&
    original!.toLowerCase() !== translated!.toLowerCase();

  if (translated) {
    return (
      <div className={`mt-1 space-y-0.5 ${className}`}>
        <p className="text-sm font-bold text-orange-600 dark:text-orange-400">{translated}</p>
        {showBoth && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{original}</p>
        )}
      </div>
    );
  }

  if (original) {
    return (
      <p
        className={`mt-1 text-sm font-medium italic text-red-700 dark:text-red-300 ${className}`}
      >
        {original}
      </p>
    );
  }

  return null;
}

export function orderItemHasWaiterNote(item: OrderItem): boolean {
  return Boolean(item.notes?.trim() || item.notesTranslated?.trim());
}
