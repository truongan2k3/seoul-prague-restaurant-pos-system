"use server";

import { eetActor } from "./auth";

/** Existing History keeps its workflow. Only enabled EET deployments route adjustments here. */
export async function adjustEetHistoryAction(scope: { ids?: string[]; start?: string; end?: string }, updates: Record<string, unknown>) {
  if (process.env.EET_CHECKOUT_ENABLED !== "true") return { handled: false as const };
  try {
    const { db, businessId, staff } = await eetActor();
    if (!["admin", "cashier", "manager"].includes(staff.role)) throw new Error("Manager authorization required to adjust payments.");
    if (scope.ids && (scope.ids.length > 5000 || scope.ids.some(id => !/^[0-9a-f-]{36}$/i.test(id)))) throw new Error("Invalid sale selection.");
    for (const date of [scope.start, scope.end]) if (date && !Number.isFinite(Date.parse(date))) throw new Error("Invalid history date range.");
    if (!scope.ids && !scope.start) throw new Error("Select a bounded payment scope.");
    const allowed = new Set(["items", "subtotal", "discount_amount", "tip", "tip_payment_method", "grand_total", "payment_method", "amount_given", "change_due", "card_auth_code", "card_last4", "card_brand", "deleted_at"]);
    if (!Object.keys(updates).length || Object.keys(updates).some(k => !allowed.has(k))) throw new Error("Unsupported payment adjustment.");
    for (const name of ["subtotal", "discount_amount", "tip", "grand_total"]) if (name in updates && (!Number.isFinite(updates[name]) || Number(updates[name]) < 0)) throw new Error("Invalid adjustment amount.");
    if ("payment_method" in updates && !["cash", "card"].includes(String(updates.payment_method))) throw new Error("Invalid payment method.");
    const { data, error } = await db.rpc("eet_adjust_sales", { p_business: businessId, p_actor: staff.id,
      p_ids: scope.ids ?? null, p_from: scope.start ?? null, p_to: scope.end ?? null, p_updates: updates });
    if (error) throw new Error(error.message);
    return { handled: true as const, data: data as { id: string; deleted_at: string | null }[], error: null };
  } catch (error) { return { handled: true as const, data: null, error: error instanceof Error ? error.message : "Payment adjustment failed." }; }
}
