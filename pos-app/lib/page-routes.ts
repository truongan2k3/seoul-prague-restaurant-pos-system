/** Station pages that only require business login (no staff picker). */
export const STATION_PATHS = ["/client", "/server", "/kds", "/bar", "/print-station"] as const;

export const PAGE_TARGETS = ["main", "client", "server", "kds", "bar", "print-station"] as const;

export type PageTarget = (typeof PAGE_TARGETS)[number];

export function isStationPath(pathname: string): boolean {
  return STATION_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function pathnameToPageTarget(pathname: string): PageTarget | null {
  if (pathname === "/" || pathname.startsWith("/?")) return "main";
  for (const path of STATION_PATHS) {
    if (pathname === path || pathname.startsWith(`${path}/`)) {
      return path.slice(1) as PageTarget;
    }
  }
  return null;
}

export const PAGE_TARGET_LABELS: Record<PageTarget, string> = {
  main: "Main POS",
  client: "Client Display",
  server: "Server Tablet",
  kds: "Kitchen (KDS)",
  bar: "Bar Display",
  "print-station": "Print Station",
};
