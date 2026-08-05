import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bar",
  description: "Bar display system",
};

export default function BarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
