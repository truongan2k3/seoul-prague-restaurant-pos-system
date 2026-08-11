import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Print Station",
  description: "Keep this tab open on the Windows PC to print kitchen tickets",
};

export default function PrintStationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
