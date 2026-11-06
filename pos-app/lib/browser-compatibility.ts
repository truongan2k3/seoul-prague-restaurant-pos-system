/** Use the visible viewport only when the browser cannot size screens with dvh. */
export function installLegacyViewportHeight(win = window, doc = document): () => void {
  if (win.CSS && typeof win.CSS.supports === "function" && win.CSS.supports("height", "100dvh")) {
    return () => {};
  }
  const style = doc.documentElement.style;
  const key = "--legacy-viewport-height";
  const previous = style.getPropertyValue(key);
  const priority = style.getPropertyPriority(key);
  const update = () => {
    const height = Math.round(win.innerHeight || doc.documentElement.clientHeight);
    if (height > 0) style.setProperty(key, `${height}px`);
  };
  update();
  win.addEventListener("resize", update);
  win.addEventListener("orientationchange", update);
  doc.addEventListener("fullscreenchange", update);
  doc.addEventListener("webkitfullscreenchange", update);
  return () => {
    win.removeEventListener("resize", update);
    win.removeEventListener("orientationchange", update);
    doc.removeEventListener("fullscreenchange", update);
    doc.removeEventListener("webkitfullscreenchange", update);
    if (previous) style.setProperty(key, previous, priority);
    else style.removeProperty(key);
  };
}

/** Older WebViews expose MediaQueryList.addListener instead of addEventListener. */
export function listenMediaQueryChange(query: MediaQueryList, listener: () => void): () => void {
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }
  query.addListener(listener);
  return () => query.removeListener(listener);
}
