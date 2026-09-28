"use client";

import { Boxes, Building2, Calendar, MapPin, X } from "lucide-react";
import { useCan } from "@/components/auth/context";
import { ASSIGNMENT_STATUS_META, durationDays, type Assignment } from "@/components/assignments/data";
import { formatDate } from "@/components/assets/data";
import { cn } from "@/lib/utils";

const AVATAR_TONES = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash];
}

export function AssignmentDetailModal({
  assignment,
  onClose,
  onUnassign,
  onReassign,
}: {
  assignment: Assignment;
  onClose: () => void;
  onUnassign: (id: number) => void;
  onReassign: (assetId: number) => void;
}) {
  const meta = ASSIGNMENT_STATUS_META[assignment.status];
  const StatusIcon = meta.icon;
  const isAssigned = assignment.status === "Assigned";
  const canAssign = useCan("operations.add_assignment");
  const canReturn = useCan("operations.add_return");
  const days = durationDays(assignment);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              <Boxes className="h-5 w-5" />
            </span>
            <div>
              <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{assignment.assetTag}</p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{assignment.assetName}</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">{assignment.assetCategory}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <span className={cn("mt-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
          <StatusIcon className="h-3.5 w-3.5" />
          {assignment.status}
        </span>

        <div className="mt-5 flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              avatarTone(assignment.employeeName)
            )}
          >
            {initials(assignment.employeeName)}
          </span>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{assignment.employeeName}</p>
            <p className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <Building2 className="h-3 w-3" />
              {assignment.department}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <MapPin className="h-3.5 w-3.5" />
              Location
            </p>
            <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{assignment.location}</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <Calendar className="h-3.5 w-3.5" />
              Assigned Date
            </p>
            <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{formatDate(assignment.assignedDate)}</p>
          </div>
          {assignment.unassignedDate && (
            <div>
              <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                <Calendar className="h-3.5 w-3.5" />
                Unassigned Date
              </p>
              <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{formatDate(assignment.unassignedDate)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-500">Duration</p>
            <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">
              {days} day{days === 1 ? "" : "s"} {isAssigned ? "and counting" : "total"}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
          {isAssigned && canReturn ? (
            <button
              type="button"
              onClick={() => onUnassign(assignment.id)}
              className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Unassign
            </button>
          ) : !isAssigned && canAssign ? (
            <button
              type="button"
              onClick={() => onReassign(assignment.assetId)}
              className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Assign
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
