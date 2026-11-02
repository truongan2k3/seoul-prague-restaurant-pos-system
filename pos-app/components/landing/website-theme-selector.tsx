"use client";

import { Moon, Check } from "lucide-react";
import { useApp } from "@/contexts/app-context";

export function WebsiteThemeSelector() {
  const { translate } = useApp();
  return <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#C9A88B]/30 bg-[#141416] px-4 py-4 text-[#F5EDE4]">
    <Moon className="h-5 w-5 text-[#C9A88B]" />
    <span className="flex-1 text-sm font-medium">{translate("darkMode")}</span>
    <Check className="h-4 w-4 text-[#C9A88B]" />
  </div>;
}
