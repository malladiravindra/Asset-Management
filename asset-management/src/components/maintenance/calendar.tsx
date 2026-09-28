"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  MAINTENANCE_STATUS_META,
  MAINTENANCE_TYPE_META,
  displayStatus,
  type MaintenanceRecord,
} from "@/components/maintenance/data";
import { TODAY, formatDate } from "@/components/assets/data";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function MaintenanceCalendar({
  records,
  onSelectRecord,
}: {
  records: MaintenanceRecord[];
  onSelectRecord: (id: number) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date>(TODAY);

  const days = useMemo(() => {
    const start = addDays(viewMonth, -viewMonth.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [viewMonth]);

  const recordsByDay = useMemo(() => {
    const map = new Map<string, MaintenanceRecord[]>();
    for (const r of records) {
      const key = r.scheduledDate.toDateString();
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    return map;
  }, [records]);

  function recordsOn(day: Date) {
    return recordsByDay.get(day.toDateString()) ?? [];
  }

  const selectedRecords = recordsOn(selectedDay);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {MONTH_LABELS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMonth(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));
                setSelectedDay(TODAY);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const inMonth = day.getMonth() === viewMonth.getMonth();
            const isToday = sameDay(day, TODAY);
            const isSelected = sameDay(day, selectedDay);
            const dayRecords = recordsOn(day);
            const visible = dayRecords.slice(0, 2);
            const overflow = dayRecords.length - visible.length;

            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={cn(
                  "flex min-h-[86px] flex-col items-stretch gap-1 border-b border-r border-slate-50 p-1.5 text-left transition last:border-r-0 dark:border-slate-800/60",
                  "hover:bg-slate-50 dark:hover:bg-slate-800/40",
                  (i + 1) % 7 === 0 && "border-r-0",
                  !inMonth && "bg-slate-50/50 dark:bg-slate-800/20",
                  isSelected && "ring-2 ring-inset ring-blue-500"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    isToday
                      ? "bg-blue-600 text-white"
                      : inMonth
                        ? "text-slate-700 dark:text-slate-200"
                        : "text-slate-300 dark:text-slate-600"
                  )}
                >
                  {day.getDate()}
                </span>
                <div className="flex flex-col gap-1">
                  {visible.map((r) => {
                    const meta = MAINTENANCE_STATUS_META[displayStatus(r)];
                    return (
                      <span
                        key={r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRecord(r.id);
                        }}
                        className={cn(
                          "flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
                          meta.chip
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
                        <span className="truncate">{r.assetTag}</span>
                      </span>
                    );
                  })}
                  {overflow > 0 && (
                    <span className="px-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                      +{overflow} more
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.02] dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          {formatDate(selectedDay)}
          {sameDay(selectedDay, TODAY) && (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
              Today
            </span>
          )}
        </div>

        {selectedRecords.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">No maintenance scheduled for this day.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {selectedRecords.map((r) => {
              const meta = MAINTENANCE_STATUS_META[displayStatus(r)];
              const StatusIcon = meta.icon;
              const typeMeta = MAINTENANCE_TYPE_META[r.type];
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onSelectRecord(r.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", typeMeta.chip)}>
                        <typeMeta.icon className="h-4.5 w-4.5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {r.assetTag} · {r.assetName}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {r.type} · {r.technician}
                        </p>
                      </div>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", meta.chip)}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {displayStatus(r)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
