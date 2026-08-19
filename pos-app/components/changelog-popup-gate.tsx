"use client";

import { useEffect, useRef, useState } from "react";
import { ChangelogPopupModal } from "@/components/changelog-popup-modal";
import { useSettings } from "@/contexts/settings-context";

/** Shows admin-configured changelog once per full page load / refresh. */
export function ChangelogPopupGate() {
  const { settings, loading } = useSettings();
  const [open, setOpen] = useState(false);
  const shownThisLoadRef = useRef(false);

  useEffect(() => {
    if (loading || shownThisLoadRef.current) return;
    if (!settings.changelogPopupEnabled) return;

    const title = settings.changelogPopupTitle.trim();
    const body = settings.changelogPopupBody.trim();
    if (!title && !body) return;

    shownThisLoadRef.current = true;
    setOpen(true);
  }, [
    loading,
    settings.changelogPopupEnabled,
    settings.changelogPopupTitle,
    settings.changelogPopupBody,
  ]);

  return (
    <ChangelogPopupModal
      open={open}
      title={settings.changelogPopupTitle}
      body={settings.changelogPopupBody}
      onAcknowledge={() => setOpen(false)}
    />
  );
}
