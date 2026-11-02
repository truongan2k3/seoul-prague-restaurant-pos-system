import { menuItemDisplayName, resolveMenuItemForOrder } from "@/lib/menu-display";
import { saleNetTotal } from "@/lib/summary-analytics";
import type { LanguageCode, MenuItem, OrderItem, SaleRecord } from "@/lib/types";

export type HistoryItemBreakdown = { key: string; name: string; quantity: number; revenue: number };

function kind(item: OrderItem): "food" | "drinks" | null {
  if (item.itemType === "food") return "food";
  if (item.itemType === "drink") return "drinks";
  return item.station === "bar" ? "drinks" : item.station === "kitchen" ? "food" : null;
}

/** Allocate stored net sales in cents, matching the dashboard's category allocation. */
export function historyItemBreakdown(sales: SaleRecord[], category: "food" | "drinks", menu: MenuItem[], language: LanguageCode): HistoryItemBreakdown[] {
  const grouped = new Map<string, HistoryItemBreakdown>();
  for (const sale of sales) {
    if (sale.deletedAt) continue;
    const lines = sale.items.filter(item=>!item.isPrintedNote&&!item.modifiers?.kitchenMessage).map((item, index) => ({item, index, kind: kind(item), weight: Math.max(0,Number(item.price)*Number(item.quantity))}));
    const weight = lines.reduce((sum,line) => sum+line.weight,0);
    const selected = lines.filter(line => line.kind===category);
    if (!selected.length) continue;
    const foodWeight=lines.filter(line=>line.kind==="food").reduce((sum,line)=>sum+line.weight,0);
    const drinkWeight=lines.filter(line=>line.kind==="drinks").reduce((sum,line)=>sum+line.weight,0);
    const netCents=Math.round((saleNetTotal(sale)+Number.EPSILON)*100);
    const drinkCents=weight>0?Math.round(netCents*drinkWeight/weight):0;
    const categoryCents=category==="drinks"?drinkCents:weight>0?Math.min(Math.round(netCents*foodWeight/weight),Math.max(0,netCents-drinkCents)):0;
    const selectedWeight=category==="drinks"?drinkWeight:foodWeight;
    const allocated=selected.map(line=>{
      const exact=selectedWeight>0?categoryCents*line.weight/selectedWeight:0;
      return {...line,cents:Math.floor(exact),remainder:exact-Math.floor(exact)};
    });
    let remaining=categoryCents-allocated.reduce((sum,line)=>sum+line.cents,0);
    for (const line of [...allocated].sort((a,b)=>b.remainder-a.remainder||a.index-b.index)) {
      if(remaining<=0)break;line.cents++;remaining--;
    }
    const share=sale.splitMode==="equal"&&Number(sale.splitCount)>1?1/Number(sale.splitCount):1;
    for (const {item,cents} of allocated) {
      const key=item.menuItemId??item.name;
      const product=resolveMenuItemForOrder(item,menu);
      const row=grouped.get(key)??{key,name:product?menuItemDisplayName(product,language):item.name,quantity:0,revenue:0};
      row.quantity+=Math.max(0,Number(item.quantity))*share;
      row.revenue=Math.round(row.revenue*100+cents)/100;
      grouped.set(key,row);
    }
  }
  return [...grouped.values()].sort((a,b)=>b.revenue-a.revenue||b.quantity-a.quantity||a.name.localeCompare(b.name));
}
