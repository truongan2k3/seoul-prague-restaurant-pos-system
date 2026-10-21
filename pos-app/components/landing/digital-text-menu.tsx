"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import {
  DIGITAL_MENU, digitalMenuCopy, localizedDigitalMenu, normalizeMenuSearch,
  type DigitalMenuLanguage, type DigitalMenuItem,
} from "@/lib/website/digital-menu";

const ORIGINAL_ITEMS = new Map<string, DigitalMenuItem>(DIGITAL_MENU.flatMap((category) => category.groups.flatMap((group) => group.items)).map((item) => [item.id, item]));

export function DigitalTextMenu({ language, active }: { language: DigitalMenuLanguage; active: boolean }) {
  const copy = digitalMenuCopy(language);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState(DIGITAL_MENU[0].id);
  const rootRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const scrollingUntilRef = useRef(0);
  const localized = useMemo(() => localizedDigitalMenu(language), [language]);
  const categories = useMemo(() => {
    const search = normalizeMenuSearch(query.trim());
    return localized.map((category) => ({ ...category,
      groups: category.groups.map((group) => ({ ...group, items: group.items.filter((item) => {
        if (!search) return true;
        const original = ORIGINAL_ITEMS.get(item.id);
        return normalizeMenuSearch([item.name, item.description, ...(item.details ?? []),
          original?.name, original?.description, ...(original?.details ?? [])].filter(Boolean).join(" ")).includes(search);
      }) })).filter((group) => group.items.length > 0),
    })).filter((category) => category.groups.length > 0);
  }, [localized, query]);
  const count = categories.reduce((sum, category) => sum + category.groups.reduce((n, group) => n + group.items.length, 0), 0);

  useEffect(() => {
    if (!active || !rootRef.current) return;
    setActiveCategory((current) => categories.some((category) => category.id === current) ? current : categories[0]?.id ?? "");
    const observer = new IntersectionObserver((entries) => {
      if (Date.now() < scrollingUntilRef.current) return;
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveCategory(visible[0].target.id.replace("menu-section-", ""));
    }, { rootMargin: "-200px 0px -45% 0px", threshold: 0 });
    rootRef.current.querySelectorAll("[data-menu-section]").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [active, categories]);

  useEffect(() => {
    if (!active) return;
    const nav = navRef.current;
    const button = nav?.querySelector<HTMLElement>(`[data-category="${activeCategory}"]`);
    if (!nav || !button) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    nav.scrollTo({ left: button.offsetLeft - nav.clientWidth / 2 + button.offsetWidth / 2, behavior: reduced ? "auto" : "smooth" });
  }, [active, activeCategory]);

  const jumpTo = (id: string) => {
    setActiveCategory(id);
    scrollingUntilRef.current = Date.now() + 700;
    document.getElementById(`menu-section-${id}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start",
    });
  };
  const tags = (values?: string[]) => values?.map((tag) => <span key={tag} className="digital-menu-tag">{copy.tags[tag] ?? digitalMenuCopy("en").tags[tag] ?? tag}</span>);
  const itemRow = (item: DigitalMenuItem) => (
    <li key={item.id} className="digital-menu-dish" id={`dish-${item.id}`}>
      <div className="digital-menu-dish-heading">
        <h4 className="digital-menu-dish-name">{item.name}</h4>
        <div className="digital-menu-prices">
          {item.prices.map((price, index) => <div key={index} className="digital-menu-price-line">
            <span className="digital-menu-price">{price.czk}<span className="digital-menu-currency"> CZK</span></span>
            {price.portion && <span className="digital-menu-portion">{copy.portions[price.portion] ?? price.portion}</span>}
          </div>)}
        </div>
      </div>
      {item.description && <p className="digital-menu-description">{item.description}</p>}
      {item.details?.length ? <div className="digital-menu-details">
        {["busan-set", "jeju-set", "gangwon-set", "seoul-set"].includes(item.id) && <p className="digital-menu-contents-label">{copy.ui.contents}</p>}
        <ul className={item.details.length > 3 ? "digital-menu-contents-grid" : undefined}>
          {item.details.map((detail, index) => <li key={index}>{detail}</li>)}
        </ul>
      </div> : null}
      {(item.tags?.length || item.spicy) ? <div className="digital-menu-tags">{tags(item.tags)}{item.spicy && <span className="digital-menu-spicy">{copy.ui.spicy}</span>}</div> : null}
    </li>
  );

  return <div ref={rootRef} className="digital-menu-text" lang={language}>
    <div className="digital-menu-tools">
      <div className="digital-menu-search-row">
        <label className="digital-menu-search">
          <Search aria-hidden size={18} />
          <span className="sr-only">{copy.ui.searchLabel}</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.ui.search} autoComplete="off" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label={copy.ui.clear}><X size={16} /></button>}
        </label>
        {query.trim() && <p className="digital-menu-result-count" role="status">{count} {copy.ui.results}</p>}
      </div>
      <nav aria-label={copy.ui.categories}>
        <div ref={navRef} className="digital-menu-category-nav">
          {categories.map((category) => <button key={category.id} type="button" data-category={category.id}
            aria-current={activeCategory === category.id ? "location" : undefined} onClick={() => jumpTo(category.id)}>{category.title}</button>)}
        </div>
      </nav>
    </div>
    <div className="digital-menu-sections">
      {categories.map((category) => <section key={category.id} id={`menu-section-${category.id}`} data-menu-section data-pdf-page={category.page} className="digital-menu-section">
        <div className="digital-menu-section-heading">
          <span className="digital-menu-section-number" aria-hidden>{String(DIGITAL_MENU.findIndex((entry) => entry.id === category.id) + 1).padStart(2, "0")}</span>
          <div><h2 className="landing-serif">{category.title}</h2>{category.subtitle && <p>{category.subtitle}</p>}</div>
        </div>
        {category.groups.map((group) => <div key={group.id} className="digital-menu-group">
          {group.title && <div className="digital-menu-group-heading"><h3>{group.title}</h3>{tags(group.tags)}</div>}
          <ul className="digital-menu-dish-list">{group.items.map(itemRow)}</ul>
        </div>)}
        {category.notes?.map((note, index) => <p key={index} className="digital-menu-category-note">{note}</p>)}
        {category.id === "hot-pot" && <p className="digital-menu-clarification">{copy.ui.portionClarification}</p>}
      </section>)}
      {!categories.length && <div className="digital-menu-empty" role="status"><p className="landing-serif">{copy.ui.empty}</p><p>{copy.ui.emptyHint}</p><button type="button" onClick={() => setQuery("")}>{copy.ui.clear}</button></div>}
    </div>
    <p className="digital-menu-allergens">{copy.ui.allergens}</p>
  </div>;
}
