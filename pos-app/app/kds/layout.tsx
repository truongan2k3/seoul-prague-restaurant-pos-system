import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kitchen",
  description: "Kitchen display system",
};

export default function KdsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
