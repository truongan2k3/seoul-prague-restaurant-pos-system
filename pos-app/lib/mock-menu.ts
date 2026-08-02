export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: "Hotpot" | "Meat" | "Drinks";
}

export const menuCategories = ["Hotpot", "Meat", "Drinks"] as const;

export const menuItems: MenuItem[] = [
  { id: "h1", name: "Spicy beef hotpot", price: 18.5, category: "Hotpot" },
  { id: "h2", name: "Mushroom hotpot", price: 14.0, category: "Hotpot" },
  { id: "h3", name: "Tomato hotpot", price: 12.5, category: "Hotpot" },
  { id: "m1", name: "Chicken burger", price: 9.5, category: "Meat" },
  { id: "m2", name: "Beef steak", price: 22.0, category: "Meat" },
  { id: "m3", name: "Pork ribs", price: 16.5, category: "Meat" },
  { id: "m4", name: "Rice noodle", price: 6.5, category: "Meat" },
  { id: "d1", name: "Sparkling water", price: 2.5, category: "Drinks" },
  { id: "d2", name: "Lemonade", price: 3.0, category: "Drinks" },
  { id: "d3", name: "White wine", price: 8.0, category: "Drinks" },
  { id: "d4", name: "Red wine", price: 9.5, category: "Drinks" },
];

export function getMenuPrice(name: string): number {
  return menuItems.find((item) => item.name === name)?.price ?? 0;
}

export function formatPrice(amount: number): string {
  const fixed = amount.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${withSpaces},${decPart} Kč`;
}
