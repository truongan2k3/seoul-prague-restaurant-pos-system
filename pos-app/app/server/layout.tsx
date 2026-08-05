import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Server",
  description: "Server tablet ordering",
};

export default function ServerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
