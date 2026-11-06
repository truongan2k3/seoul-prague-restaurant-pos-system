"use client";

import { useEffect } from "react";
import { installLegacyViewportHeight } from "@/lib/browser-compatibility";

export function BrowserCompatibility() {
  useEffect(() => installLegacyViewportHeight(), []);
  return null;
}
