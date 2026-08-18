"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

export interface UnsavedWorkEntry {
  id: string;
  isDirty: () => boolean;
  /** Optional save before refresh / leave. Throw or return false on failure. */
  onSave?: () => Promise<boolean | void> | boolean | void;
}

interface UnsavedWorkContextValue {
  register: (entry: UnsavedWorkEntry) => void;
  unregister: (id: string) => void;
  hasUnsavedWork: () => boolean;
  getDirtyEntries: () => UnsavedWorkEntry[];
}

const UnsavedWorkContext = createContext<UnsavedWorkContextValue | null>(null);

export function UnsavedWorkProvider({ children }: { children: ReactNode }) {
  const entriesRef = useRef(new Map<string, UnsavedWorkEntry>());

  const register = useCallback((entry: UnsavedWorkEntry) => {
    entriesRef.current.set(entry.id, entry);
  }, []);

  const unregister = useCallback((id: string) => {
    entriesRef.current.delete(id);
  }, []);

  const getDirtyEntries = useCallback(() => {
    return [...entriesRef.current.values()].filter((entry) => {
      try {
        return entry.isDirty();
      } catch {
        return false;
      }
    });
  }, []);

  const hasUnsavedWork = useCallback(() => getDirtyEntries().length > 0, [getDirtyEntries]);

  const value = useMemo(
    () => ({ register, unregister, hasUnsavedWork, getDirtyEntries }),
    [register, unregister, hasUnsavedWork, getDirtyEntries],
  );

  return <UnsavedWorkContext.Provider value={value}>{children}</UnsavedWorkContext.Provider>;
}

export function useUnsavedWork(): UnsavedWorkContextValue {
  const ctx = useContext(UnsavedWorkContext);
  if (!ctx) {
    throw new Error("useUnsavedWork must be used within UnsavedWorkProvider");
  }
  return ctx;
}

/** Register dirty state for pull-to-refresh / beforeunload guards. */
export function useRegisterUnsavedWork(entry: UnsavedWorkEntry): void {
  const { register, unregister } = useUnsavedWork();
  const entryRef = useRef(entry);

  useEffect(() => {
    entryRef.current = entry;
  });

  useEffect(() => {
    const wrapped: UnsavedWorkEntry = {
      id: entry.id,
      isDirty: () => entryRef.current.isDirty(),
      onSave: entry.onSave
        ? () => entryRef.current.onSave?.()
        : undefined,
    };
    register(wrapped);
    return () => unregister(entry.id);
  }, [entry.id, entry.onSave, register, unregister]);
}
