"use client";

import { createElement } from "react";
import Link from "next/link";
import { ArrowUpRight, X } from "lucide-react";
import { iconFor, chipFor, destinationLabelFor, formatNotificationTime, type Notification } from "@/components/notifications/data";
import { cn } from "@/lib/utils";

export function NotificationDetailModal({
  notification,
  onClose,
}: {
  notification: Notification;
  onClose: () => void;
}) {
  const Icon = iconFor(notification.type);
  const destinationLabel = destinationLabelFor(notification.href);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-4">
      <button aria-label="Close" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                chipFor(notification.type)
              )}
            >
              {createElement(Icon, { className: "h-5 w-5", strokeWidth: 2 })}
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {notification.title}
              </h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                {formatNotificationTime(notification.createdAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {notification.message}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 p-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Close
          </button>
          <Link
            href={notification.href}
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            {destinationLabel}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
