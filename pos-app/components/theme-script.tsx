"use client";

import { useServerInsertedHTML } from "next/navigation";

/** Boot light/dark + light pastel shell bg before paint (avoids flash). */
const THEME_INIT_SCRIPT = `(function(){try{var r=document.documentElement;var t=localStorage.getItem("pos-theme");if(t==="dark"){r.classList.add("dark");r.style.removeProperty("--background");r.style.removeProperty("--accent");r.removeAttribute("data-light-bg");return;}r.classList.remove("dark");var raw=localStorage.getItem("pos-light-bg")||"default";var bg="#f9fafb";var accent="#f3f4f6";var presets={default:["#f9fafb","#f3f4f6"],mist:["#eef3f8","#e2ebf3"],blush:["#fdf2f4","#f8e4e8"],peach:["#fff1e8","#ffe4d4"],cream:["#faf6ef","#f3ebe0"],mint:["#eef8f3","#dff1e7"],lavender:["#f3f0fa","#e8e3f5"],sky:["#eef6fb","#ddeef8"]};var id="default";if(raw.indexOf("custom:")===0){var hex=raw.slice(7).trim();if(/^#([0-9a-fA-F]{3})$/.test(hex)){var s=hex.slice(1);hex="#"+s[0]+s[0]+s[1]+s[1]+s[2]+s[2];}if(/^#([0-9a-fA-F]{6})$/.test(hex)){bg=hex.toLowerCase();var n=parseInt(bg.slice(1),16);var R=(n>>16)&255,G=(n>>8)&255,B=n&255;var m=function(c){return Math.round(c*0.92+255*0.08).toString(16).padStart(2,"0");};accent="#"+m(R)+m(G)+m(B);id="custom";}else if(presets.default){bg=presets.default[0];accent=presets.default[1];}}else if(presets[raw]){bg=presets[raw][0];accent=presets[raw][1];id=raw;}r.style.setProperty("--background",bg);r.style.setProperty("--accent",accent);r.setAttribute("data-light-bg",id);}catch(e){}})();`;

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
