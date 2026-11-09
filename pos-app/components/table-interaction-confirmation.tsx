"use client";

import { useState } from "react";
import styles from "./table-interaction-confirmation.module.css";

/** Mount with the active table ID as its key; unmounting cancels the animation. */
export function TableInteractionConfirmation({ tableLabel }: { tableLabel: string }) {
  const [finished, setFinished] = useState(false);

  if (finished) return null;

  return (
    <div
      className={styles.overlay}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      onAnimationEnd={event => {
        if (event.target === event.currentTarget) setFinished(true);
      }}
    >
      <div className={styles.content}>
        <p className={styles.caption}>YOU ARE INTERACTING WITH</p>
        <p className={styles.table}>
          <span className={styles.prefix}>TABLE</span>{" "}
          <span className={styles.identifier}>{tableLabel}</span>
        </p>
      </div>
    </div>
  );
}
