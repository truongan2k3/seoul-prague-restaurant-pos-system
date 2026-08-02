/** Shared filter/tab button classes — safe contrast in light & dark mode. */

export function filterButtonClass(active: boolean): string {
  return active ? "pos-filter-btn-active" : "pos-filter-btn";
}

export function segmentButtonClass(active: boolean): string {
  return active ? "pos-segment-btn-active" : "pos-segment-btn";
}

export function navButtonClass(active: boolean): string {
  return active ? "pos-nav-btn-active" : "pos-nav-btn";
}

export function paymentFilterClass(active: boolean, method: "all" | "cash" | "card"): string {
  if (!active) return "pos-filter-btn";
  if (method === "cash") return "bg-emerald-600 text-white font-medium hover:bg-emerald-700";
  if (method === "card") return "bg-blue-600 text-white font-medium hover:bg-blue-700";
  return "pos-filter-btn-active";
}
