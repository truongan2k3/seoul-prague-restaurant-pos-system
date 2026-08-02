"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { STAFF_ROLES } from "@/lib/staff-roles";
import type { StaffMember, StaffRole } from "@/lib/types";
import type { StaffInput } from "@/src/lib/staff-actions";

const emptyForm: StaffInput = {
  name: "",
  role: "server",
  pin: "",
  active: true,
};

interface StaffFormModalProps {
  open: boolean;
  member?: StaffMember | null;
  onClose: () => void;
  onSave: (input: StaffInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  isSaving?: boolean;
}

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  manager: "Manager",
  server: "Server",
  kitchen: "Kitchen",
  bar: "Bar",
};

export function StaffFormModal({
  open,
  member,
  onClose,
  onSave,
  onDelete,
  isSaving = false,
}: StaffFormModalProps) {
  const [form, setForm] = useState<StaffInput>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (member) {
      setForm({
        name: member.name,
        role: member.role,
        pin: member.pin ?? "",
        active: member.active,
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, member]);

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (form.pin && !/^\d{4}$/.test(form.pin)) {
      setError("PIN must be exactly 4 digits");
      return;
    }
    setError(null);
    await onSave(form);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={member ? "Edit Staff Member" : "New Staff Member"}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {member && onDelete ? (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void onDelete()}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-800 dark:border-gray-600 dark:text-gray-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void handleSubmit()}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <label className="block">
          <span className="pos-label">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="pos-input mt-1"
            placeholder="Full name"
          />
        </label>

        <label className="block">
          <span className="pos-label">Role</span>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as StaffRole }))}
            className="pos-input mt-1"
          >
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="pos-label">PIN Code (4 digits)</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={form.pin}
            onChange={(e) =>
              setForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))
            }
            className="pos-input mt-1 tracking-[0.4em]"
            placeholder="••••"
          />
        </label>

        <label className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-600">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Active</span>
        </label>
      </div>
    </Modal>
  );
}
