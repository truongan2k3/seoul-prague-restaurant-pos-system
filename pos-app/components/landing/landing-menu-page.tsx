"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-menu-gallery";
import { BookingCta } from "@/components/landing/booking-cta";
import { DigitalTextMenu } from "@/components/landing/digital-text-menu";
import { LanguageSelector } from "@/components/language-selector";
import { useApp } from "@/contexts/app-context";
import { GUEST_LANG_CHANGE_EVENT, GUEST_LANG_SESSION_KEY, persistGuestReservationLang } from "@/lib/i18n/guest-reservation";
import { DIGITAL_MENU_LANGUAGES, digitalMenuCopy, isDigitalMenuLanguage, type DigitalMenuLanguage } from "@/lib/website/digital-menu";
import type { WebsiteContent } from "@/lib/website/types";
import "./digital-menu.css";

const MenuPdfFlipbook = dynamic(() => import("@/components/landing/menu-pdf-flipbook").then((module) => module.MenuPdfFlipbook));
type MenuView = "digital" | "pdf";

export function LandingMenuPageView({ content }: { content: WebsiteContent }) {
  const app = useApp();
  const [language, setLanguage] = useState<DigitalMenuLanguage>("en");
  const [view, setView] = useState<MenuView>("digital");
  const [pdfVisited, setPdfVisited] = useState(false);
  const copy = digitalMenuCopy(language).ui;

  useEffect(() => {
    let stored: string | null = null;
    try { stored = sessionStorage.getItem(GUEST_LANG_SESSION_KEY); } catch { /* Storage may be disabled. */ }
    setLanguage(isDigitalMenuLanguage(stored) ? stored : app.language === "zh" ? "vi" : app.language);
    const onGuestLanguage = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (isDigitalMenuLanguage(next)) setLanguage(next);
    };
    window.addEventListener(GUEST_LANG_CHANGE_EVENT, onGuestLanguage);
    return () => window.removeEventListener(GUEST_LANG_CHANGE_EVENT, onGuestLanguage);
  }, [app.language]);

  const changeLanguage = (next: DigitalMenuLanguage) => {
    setLanguage(next);
    if (next === "en" || next === "cs" || next === "vi") app.setLanguage(next);
    persistGuestReservationLang(next);
  };
  const changeView = (next: MenuView) => {
    if (next === "pdf") setPdfVisited(true);
    setView(next);
  };

  return <div className="landing-theme digital-menu-page min-h-screen">
    <LandingNavbar content={content} />
    <main className="digital-menu-main" lang={language}>
      <div className="digital-menu-container">
        <div className="digital-menu-hero digital-menu-enter">
          <div className="digital-menu-hero-top">
            <Link href="/" className="digital-menu-home">← {copy.home}</Link>
            <LanguageSelector<DigitalMenuLanguage> variant="dropdown" language={language} onLanguageChange={changeLanguage}
              languageOptions={DIGITAL_MENU_LANGUAGES} ariaLabel={copy.language} className="digital-menu-language" />
          </div>
          <p className="digital-menu-eyebrow">{content.settings.restaurantName}</p>
          <h1 className="landing-serif">{copy.title}</h1>
          <p className="digital-menu-introduction">{copy.subtitle}</p>
          <div className="digital-menu-view-switch" role="tablist" aria-label={copy.title}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "digital" : event.key === "End" ? "pdf" : view === "digital" ? "pdf" : "digital";
              changeView(next);
              document.getElementById(`menu-tab-${next}`)?.focus();
            }}>
            {(["digital", "pdf"] as const).map((entry) => <button key={entry} type="button" role="tab"
              id={`menu-tab-${entry}`} aria-controls={`menu-panel-${entry}`} aria-selected={view === entry}
              tabIndex={view === entry ? 0 : -1} onClick={() => changeView(entry)}>{copy[entry]}</button>)}
          </div>
        </div>
        <div id="menu-panel-digital" role="tabpanel" aria-labelledby="menu-tab-digital" hidden={view !== "digital"}>
          <DigitalTextMenu language={language} active={view === "digital"} />
        </div>
        <div id="menu-panel-pdf" role="tabpanel" aria-labelledby="menu-tab-pdf" hidden={view !== "pdf"} className="digital-menu-pdf">
          {pdfVisited && <MenuPdfFlipbook pdfs={content.menuPdfs.filter((pdf) => pdf.language !== "zh")} initialLanguage={language === "cs" ? "cs" : "en"} />}
        </div>
        <div className="digital-menu-booking"><BookingCta size="lg" /></div>
      </div>
    </main>
    <LandingFooter content={content} />
  </div>;
}
