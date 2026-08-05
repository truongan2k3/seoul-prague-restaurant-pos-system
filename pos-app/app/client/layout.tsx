import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client",
  description: "Customer-facing checkout display synced with the main POS",
};

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return children;
}
