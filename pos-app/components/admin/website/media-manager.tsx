"use client";

import { useRouter } from "next/navigation";
import { WEBSITE_MEDIA_SLOTS } from "@/lib/website/media-slots";
import type { WebsiteContent } from "@/lib/website/types";
import { MediaSlotCard } from "@/components/admin/website/media-slot-card";

export function MediaManager({ content }: { content: WebsiteContent }) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Media slots</h1>
        <p className="mt-2 text-sm text-gray-500">
          Upload branded assets for the landing page hero, logo, about section, and signature dishes.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        {WEBSITE_MEDIA_SLOTS.map((spec) => (
          <MediaSlotCard
            key={spec.slot}
            spec={spec}
            asset={content.media[spec.slot]}
            onUpdated={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  );
}
