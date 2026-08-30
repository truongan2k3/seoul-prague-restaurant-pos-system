"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChangelogPopupModal } from "@/components/changelog-popup-modal";
import { subscribeToAdminPopup } from "@/lib/pos-admin-broadcast";
import { pathnameToPageTarget } from "@/lib/page-routes";
import type { AdminPopupBroadcastPayload } from "@/src/lib/status-admin-actions";

/** Receives instant admin popup broadcasts for the current page. */
export function AdminBroadcastListener() {
  const pathname = usePathname();
  const pageTarget = pathnameToPageTarget(pathname);
  const [popup, setPopup] = useState<AdminPopupBroadcastPayload | null>(null);

  useEffect(() => {
    if (!pageTarget) return;
    return subscribeToAdminPopup(pageTarget, (payload) => {
      setPopup(payload);
    });
  }, [pageTarget]);

  if (!pageTarget || !popup) return null;

  return (
    <ChangelogPopupModal
      open
      title={popup.title}
      body={popup.message}
      onAcknowledge={() => setPopup(null)}
    />
  );
}
