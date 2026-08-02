"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { LiveClock } from "@/components/live-clock";
import { StaffFormModal } from "@/components/staff-form-modal";
import { useApp } from "@/contexts/app-context";
import { usePinGate } from "@/contexts/pin-gate-context";
import { canManageStaff } from "@/lib/staff-roles";
import type { StaffMember, StaffRole } from "@/lib/types";
import {
  createStaff,
  deleteStaff,
  updateStaff,
  type StaffInput,
} from "@/src/lib/staff-actions";

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Admin",
  manager: "Manager",
  server: "Server",
  kitchen: "Kitchen",
  bar: "Bar",
};

interface StaffViewProps {
  onRefresh: () => void;
}

export function StaffView({ onRefresh }: StaffViewProps) {
  const { translate, currentStaffUser, staffList, logAction } = useApp();
  const { requestPin } = usePinGate();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canManageStaff(currentStaffUser?.role)) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Staff management is available to Admin and Manager roles only.
        </p>
      </div>
    );
  }

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    setFormOpen(true);
  };

  const handleSave = async (input: StaffInput) => {
    setIsSaving(true);
    setError(null);

    const result = editing
      ? await updateStaff(editing.id, input)
      : await createStaff(input);

    setIsSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    logAction(editing ? "update staff" : "create staff", input.name);
    setFormOpen(false);
    setEditing(null);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!editing) return;
    await new Promise<void>((resolve) => {
      requestPin(async () => {
        setIsSaving(true);
        const { error: deleteError } = await deleteStaff(editing.id);
        setIsSaving(false);
        if (deleteError) {
          setError(deleteError.message);
          resolve();
          return;
        }
        logAction("delete staff", editing.name);
        setFormOpen(false);
        setEditing(null);
        onRefresh();
        resolve();
      });
    });
  };

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {translate("staffManagement")}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {staffList.length} members · synced with Supabase
          </p>
        </div>
        <LiveClock />
      </header>

      <div className="flex-1 overflow-auto p-6">
        <section className="mx-auto max-w-5xl rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-gray-400" />
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Team roster</h2>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white dark:bg-gray-100 dark:text-gray-900"
            >
              <Plus className="h-4 w-4" />
              New Staff Member
            </button>
          </div>

          {error && (
            <p className="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
                  <th className="px-6 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {staffList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      No staff members yet.
                    </td>
                  </tr>
                ) : (
                  staffList.map((member) => (
                    <tr
                      key={member.id}
                      className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 ${
                        !member.active ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-6 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{member.name}</p>
                        {member.id === currentStaffUser?.id && (
                          <span className="text-[10px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                            Current session
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                          {ROLE_LABELS[member.role]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            member.active
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {member.active ? translate("active") : translate("inactive")}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(member)}
                            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
                            aria-label={`Edit ${member.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              requestPin(async () => {
                                setIsSaving(true);
                                setError(null);
                                const { error: deleteError } = await deleteStaff(member.id);
                                setIsSaving(false);
                                if (deleteError) {
                                  setError(deleteError.message);
                                  return;
                                }
                                logAction("delete staff", member.name);
                                onRefresh();
                              })
                            }
                            disabled={isSaving}
                            className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
                            aria-label={`Delete ${member.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <StaffFormModal
        open={formOpen}
        member={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
          setError(null);
        }}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined}
        isSaving={isSaving}
      />
    </div>
  );
}
