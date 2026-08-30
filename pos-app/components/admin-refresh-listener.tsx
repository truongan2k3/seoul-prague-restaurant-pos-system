"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { subscribeToAdminRefresh } from "@/lib/pos-admin-broadcast";
import { pathnameToPageTarget } from "@/lib/page-routes";

/** Reloads the page when /status sends a remote refresh command. */
export function AdminRefreshListener() {
  const pathname = usePathname();
  const pageTarget = pathnameToPageTarget(pathname);

  useEffect(() => {
    if (!pageTarget) return;
    return subscribeToAdminRefresh(pageTarget, () => {
      window.location.reload();
    });
  }, [pageTarget]);

  return null;
}
