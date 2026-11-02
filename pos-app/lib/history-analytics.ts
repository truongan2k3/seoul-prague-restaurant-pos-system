import { shiftIsoDate } from "@/lib/reservation-analytics";
import { todayIsoDateInVenue, venueDayRangeUtc, venueWeekdayIndex } from "@/lib/venue-timezone";
import { resolveTipPaymentMethod } from "@/lib/summary-analytics";
import type { SaleRecord } from "@/lib/types";

export type HistoryDates = { from: string; to: string };
/** Actual cash/card collection, using each payment's stored charge after voucher credit. */
export function historyCollectedPayments(sales: SaleRecord[]) {
  let cash=0,card=0,cashTips=0,cardTips=0,cashWithoutTips=0,cardWithoutTips=0;
  for(const sale of sales){
    if(sale.deletedAt||(sale.paymentMethod!=="cash"&&sale.paymentMethod!=="card"))continue;
    const recordedTip=Math.round((Number(sale.tip)||0)*100);
    const tipMethod=resolveTipPaymentMethod(sale);
    if(tipMethod==="cash")cashTips+=recordedTip;else cardTips+=recordedTip;
    if(!Number.isFinite(sale.grandTotal))continue;
    const total=Math.max(0,Math.round((sale.grandTotal+Number.EPSILON)*100));
    const tip=Math.min(total,Math.max(0,recordedTip));
    const base=total-tip;
    if(sale.paymentMethod==="cash"){cash+=base;cashWithoutTips+=base;}else{card+=base;cardWithoutTips+=base;}
    if(tipMethod==="cash")cash+=tip;else card+=tip;
  }
  return {cash:cash/100,card:card/100,total:(cash+card)/100,cashTips:cashTips/100,cardTips:cardTips/100,cashWithoutTips:cashWithoutTips/100,cardWithoutTips:cardWithoutTips/100};
}
export type HistoryDailyPoint = { date: string; revenue: number; orders: number; tips?: number; average?: number | null };
export type HistoryMetric = { from: string; to: string; payments: number; orders: number; gross: number; revenue: number; average: number; averagePerPerson?: number | null; discounts: number; tips: number; referralRevenue: number; referralDiscounts: number; hourly: { hour: number; revenue: number; orders: number; tips?: number; average?: number | null }[]; timeline?: HistoryDailyPoint[] };
export type HistoryAttribution = { codeId: string | null; code: string | null; partner: string | null; discountPercent: number; discountAmount: number; commission: number | null };
export type HistoryAnalytics = {
  canViewCommission: boolean; periods: HistoryMetric[]; daily: HistoryDailyPoint[];
  breakdown: { food: number; drinks: number; unclassified: number };
  referrals: { referral_code_id: string | null; code: string; partner: string; orders: number; payments: number; net_sales: number; discounts: number; commission: number | null }[];
  attributions: Record<string, HistoryAttribution>; codes: string[]; partners: string[];
};
export function isHistoryDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value;
}
export function historyDates(period: "day" | "week" | "month" | "custom", anchor: string, from: string, to: string): HistoryDates {
  const today = todayIsoDateInVenue();
  if (period === "day") { const day = isHistoryDate(anchor) ? anchor : today; return { from: day, to: day }; }
  if (period === "week") return { from: shiftIsoDate(today, -((venueWeekdayIndex(today)+6)%7)), to: today };
  if (period === "month") return { from: `${today.slice(0,7)}-01`, to: today };
  const first = isHistoryDate(from) ? from : today; const last = isHistoryDate(to) ? to : first;
  return first <= last ? { from: first, to: last } : { from: last, to: first };
}
export function historyUtcRange(dates: HistoryDates) {
  const start = new Date(venueDayRangeUtc(dates.from).startIso);
  const end = new Date(new Date(venueDayRangeUtc(dates.to).endExclusiveIso).getTime()-1);
  return { start, end };
}
export function isHistoryCalendarMonth(dates: HistoryDates) {
  return dates.from.endsWith("-01") && dates.from.slice(0,7)===dates.to.slice(0,7) && shiftIsoDate(dates.to,1).endsWith("-01");
}
export function historyComparisonPeriods(dates: HistoryDates, monthComparison=false) {
  const days = Math.round((Date.parse(`${dates.to}T00:00:00Z`)-Date.parse(`${dates.from}T00:00:00Z`))/86_400_000)+1;
  const monthStart=`${dates.from.slice(0,7)}-01`;
  const previousMonthEnd=shiftIsoDate(monthStart,-1);
  const previous=monthComparison||isHistoryCalendarMonth(dates)
    ? {from:`${previousMonthEnd.slice(0,7)}-01`,to:previousMonthEnd}
    : {from:shiftIsoDate(dates.from,-days),to:shiftIsoDate(dates.to,-days)};
  return [dates,previous,{from:shiftIsoDate(dates.from,-7),to:shiftIsoDate(dates.to,-7)}];
}
export function saleReferral(sale: SaleRecord, extra?: HistoryAttribution) {
  return { codeId: sale.referralCodeId ?? extra?.codeId ?? null, code: sale.referralCode ?? extra?.code ?? null,
    partner: sale.referralPartner ?? extra?.partner ?? null, discountPercent: sale.referralDiscountPercent ?? extra?.discountPercent ?? 0,
    discountAmount: sale.referralDiscountAmount ?? extra?.discountAmount ?? 0, commission: extra?.commission ?? null };
}
export type HistoryFinancialChange = { closedAt?: string; previousClosedAt?: string; saleId?: string };
type Cached = { dates: HistoryDates[]; data?: HistoryAnalytics; expires: number; version: number; pending?: Promise<HistoryAnalytics> };
const cache = new Map<string, Cached>();
const listeners = new Set<(event: HistoryFinancialChange) => void>();
export function subscribeHistoryFinancialChanges(listener: (event: HistoryFinancialChange) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function historyChangeMatches(event: HistoryFinancialChange, dates: HistoryDates) {
  if (!event.closedAt && !event.previousClosedAt) return true;
  const { start,end }=historyUtcRange(dates);
  return [event.closedAt,event.previousClosedAt].some(value => value && Date.parse(value)>=start.getTime() && Date.parse(value)<=end.getTime());
}
export function publishHistoryFinancialChange(event: HistoryFinancialChange) {
  for (const entry of cache.values()) if (entry.dates.some(dates=>historyChangeMatches(event,dates))) { entry.expires=0; entry.version++; entry.pending=undefined; }
  listeners.forEach(listener=>listener(event));
}
/** Re-entering History follows an unobserved period: expire snapshots once, without polling. */
export function expireHistoryAnalyticsCache() { for(const entry of cache.values()){entry.expires=0;entry.version++;entry.pending=undefined;} }
export async function cachedHistoryAnalytics(key: string, dates: HistoryDates, loader: () => Promise<HistoryAnalytics>, monthComparison=false): Promise<HistoryAnalytics> {
  let entry=cache.get(key);
  if(entry?.data && entry.expires>Date.now())return entry.data;
  if(entry?.pending)return entry.pending;
  if(!entry){entry={dates:historyComparisonPeriods(dates,monthComparison),expires:0,version:0};cache.set(key,entry);}
  const target=entry,version=entry.version;
  const pending=loader().then(data=>{if(target.version===version){target.data=data;target.expires=Date.now()+60_000;}return data;}).finally(()=>{if(target.pending===pending)target.pending=undefined;});
  target.pending=pending;
  if(cache.size>30){const oldest=cache.keys().next().value;if(oldest && oldest!==key)cache.delete(oldest);}
  return pending;
}
