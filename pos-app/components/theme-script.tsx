"use client";

import { useServerInsertedHTML } from "next/navigation";

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("pos-theme");var r=document.documentElement;if(t==="dark")r.classList.add("dark");else r.classList.remove("dark");}catch(e){}})();`;

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
