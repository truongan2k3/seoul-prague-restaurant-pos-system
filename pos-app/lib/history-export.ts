import { historyCollectedPayments, type HistoryAnalytics } from "@/lib/history-analytics";
import { resolveTipPaymentMethod, saleNetTotal } from "@/lib/summary-analytics";
import { formatInVenueTz } from "@/lib/venue-timezone";
import type { SaleRecord } from "@/lib/types";

export async function exportHistory(sales:SaleRecord[],analytics:HistoryAnalytics|null,filename:string,excel:boolean) {
  const rows=sales.map(sale=>({
    Payment_ID:sale.id,Table:sale.tableLabel,Closed_Prague:formatInVenueTz(sale.closedAt,"en-GB",{dateStyle:"short",timeStyle:"medium",hour12:false}),
    Staff:sale.staffName,Method:sale.paymentMethod,Voided:!!sale.deletedAt,Recorded_total_CZK:sale.grandTotal,Subtotal_CZK:sale.deletedAt?0:sale.subtotal,Net_sales_CZK:sale.deletedAt?0:saleNetTotal(sale),
    Discount_CZK:sale.deletedAt?0:sale.discountAmount,Tip_CZK:sale.deletedAt?0:sale.tip,Tip_Method:resolveTipPaymentMethod(sale),Collected_CZK:sale.deletedAt?0:sale.grandTotal,Voucher_credit_CZK:sale.deletedAt?0:sale.voucherDiscountAmount??0,
    Split_mode:sale.splitMode??"total",Split_count:sale.splitCount??1,
  }));
  if(excel){
    const XLSX=await import("xlsx");const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),"Payments");
    const collected=historyCollectedPayments(sales);
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{Cash_CZK:collected.cash,Card_CZK:collected.card,Total_Collected_CZK:collected.total,Tips_Cash_CZK:collected.cashTips,Tips_Card_CZK:collected.cardTips}]),"Collected payments");
    if(analytics){
      XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(analytics.periods.map(({from,to,revenue,tips,average})=>({from,to,revenue,tips,averagePerTable:average}))),"Revenue comparisons");
      XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet([{Revenue_Food_CZK:analytics.breakdown.food,Revenue_Drinks_CZK:analytics.breakdown.drinks}]),"Food and Drinks");
    }
    XLSX.writeFile(book,`${filename}.xlsx`);return;
  }
  const headers=rows.length?Object.keys(rows[0]):["Payment_ID","Table","Closed_Prague"];
  const cell=(value:unknown)=>{let result=String(value??"");if(/^[=+\-@\t\r]/.test(result))result="'"+result;return '"'+result.replace(/"/g,'""')+'"';};
  const csv=[headers.map(cell).join(","),...rows.map(row=>headers.map(key=>cell((row as Record<string,unknown>)[key])).join(","))].join("\r\n");
  const url=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=`${filename}.csv`;link.click();URL.revokeObjectURL(url);
}
