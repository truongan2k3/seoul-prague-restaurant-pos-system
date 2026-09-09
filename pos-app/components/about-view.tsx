"use client";

import { TomatoAboutPanel } from "@/components/tomato-maker-credit";
import { useApp } from "@/contexts/app-context";

export function AboutView() {
  const { translate } = useApp();
  return (
    <div className="h-full overflow-y-auto bg-background">
      <TomatoAboutPanel title={translate("about")} />
    </div>
  );
}
