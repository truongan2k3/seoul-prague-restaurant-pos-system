"use client";

import { useServerInsertedHTML } from "next/navigation";
/** Migrate legacy preferences before the first paint. */
const THEME_INIT_SCRIPT = `(function(){var r=document.documentElement;r.classList.add("dark");r.dataset.theme="dark";r.style.colorScheme="dark";delete r.dataset.websiteTheme;delete r.dataset.posTheme;r.removeAttribute("data-light-bg");r.style.removeProperty("--background");r.style.removeProperty("--accent");try{localStorage.setItem("pos-theme","dark");localStorage.removeItem("pos-light-bg");localStorage.removeItem("pos-halloween-animations");}catch(e){}})();`;

/** Injects theme bootstrap into SSR HTML outside the client React tree (avoids React 19 script warning). */
export function ThemeScript() {
  useServerInsertedHTML(() => (
    <script
      id="pos-theme-init"
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  ));

  return null;
}
