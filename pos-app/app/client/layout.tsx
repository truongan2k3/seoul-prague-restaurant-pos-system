import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Customer Display | Seoul Prague",
  description: "Customer-facing checkout display synced with the main POS",
};

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return children;
}
