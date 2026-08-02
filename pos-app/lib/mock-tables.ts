export type TableStatus = "empty" | "occupied";

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface RestaurantTable {
  id: string;
  label: string;
  type: "regular" | "special";
  status: TableStatus;
  gridColumn: string;
  gridRow: string;
  occupiedAt?: Date;
  orders?: OrderItem[];
}

export const tables: RestaurantTable[] = [
  {
    id: "t1",
    label: "1",
    type: "regular",
    status: "empty",
    gridColumn: "1",
    gridRow: "1",
  },
  {
    id: "t2",
    label: "2",
    type: "regular",
    status: "occupied",
    gridColumn: "2",
    gridRow: "1",
    occupiedAt: new Date(Date.now() - 80 * 1000),
    orders: [
      { name: "Chicken burger", quantity: 1, price: 9.5 },
      { name: "Rice noodle", quantity: 2, price: 6.5 },
    ],
  },
  {
    id: "t3",
    label: "3",
    type: "regular",
    status: "empty",
    gridColumn: "3",
    gridRow: "1",
  },
  {
    id: "t4",
    label: "4",
    type: "regular",
    status: "occupied",
    gridColumn: "4",
    gridRow: "1",
    occupiedAt: new Date(Date.now() - 45 * 1000),
    orders: [{ name: "Caesar salad", quantity: 1, price: 8.0 }],
  },
  {
    id: "s1",
    label: "S1",
    type: "special",
    status: "occupied",
    gridColumn: "6",
    gridRow: "1 / span 2",
    occupiedAt: new Date(Date.now() - 7 * 60 * 1000 - 20 * 1000),
    orders: [
      { name: "Seafood platter", quantity: 1, price: 28.0 },
      { name: "White wine", quantity: 2, price: 8.0 },
      { name: "Tiramisu", quantity: 1, price: 7.5 },
    ],
  },
  {
    id: "t5",
    label: "5",
    type: "regular",
    status: "empty",
    gridColumn: "1",
    gridRow: "2",
  },
  {
    id: "t6",
    label: "6",
    type: "regular",
    status: "occupied",
    gridColumn: "2",
    gridRow: "2",
    occupiedAt: new Date(Date.now() - 3 * 60 * 1000),
    orders: [
      { name: "Margherita pizza", quantity: 2, price: 11.0 },
      { name: "Sparkling water", quantity: 1, price: 2.5 },
    ],
  },
  {
    id: "t7",
    label: "7",
    type: "regular",
    status: "empty",
    gridColumn: "3",
    gridRow: "2",
  },
  {
    id: "t8",
    label: "8",
    type: "regular",
    status: "empty",
    gridColumn: "4",
    gridRow: "2",
  },
  {
    id: "s2",
    label: "S2",
    type: "special",
    status: "empty",
    gridColumn: "6",
    gridRow: "3",
  },
  {
    id: "t9",
    label: "9",
    type: "regular",
    status: "occupied",
    gridColumn: "1",
    gridRow: "3",
    occupiedAt: new Date(Date.now() - 12 * 60 * 1000),
    orders: [{ name: "Beef steak", quantity: 2, price: 22.0 }],
  },
  {
    id: "t10",
    label: "10",
    type: "regular",
    status: "empty",
    gridColumn: "2",
    gridRow: "3",
  },
  {
    id: "t11",
    label: "11",
    type: "regular",
    status: "empty",
    gridColumn: "3",
    gridRow: "3",
  },
  {
    id: "t12",
    label: "12",
    type: "regular",
    status: "occupied",
    gridColumn: "4",
    gridRow: "3",
    occupiedAt: new Date(Date.now() - 5 * 60 * 1000 - 30 * 1000),
    orders: [
      { name: "Fish & chips", quantity: 1, price: 13.5 },
      { name: "Lemonade", quantity: 2, price: 3.0 },
    ],
  },
  {
    id: "t13",
    label: "13",
    type: "regular",
    status: "empty",
    gridColumn: "1",
    gridRow: "4",
  },
  {
    id: "t14",
    label: "14",
    type: "regular",
    status: "empty",
    gridColumn: "2",
    gridRow: "4",
  },
  {
    id: "t15",
    label: "15",
    type: "regular",
    status: "occupied",
    gridColumn: "3 / span 2",
    gridRow: "4",
    occupiedAt: new Date(Date.now() - 22 * 60 * 1000),
    orders: [
      { name: "Pasta carbonara", quantity: 3, price: 12.0 },
      { name: "Garlic bread", quantity: 2, price: 4.5 },
      { name: "Red wine", quantity: 1, price: 9.5 },
    ],
  },
];
