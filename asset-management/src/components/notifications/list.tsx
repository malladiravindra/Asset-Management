"use client";

import { useMemo, useState } from "react";
import { BellOff, Check } from "lucide-react";
import { useNotifications } from "@/components/notifications/context";
import { iconFor, chipFor, formatNotificationTime, type Notification } from "@/components/notifications/data";
import { NotificationDetailModal } from "@/components/notifications/detail-modal";
import { cn } from "@/lib/utils";

export function NotificationsList() {
  const { notifications, unreadCount, total, hasMore, loading, loadMore, markAsRead, markAllAsRead } = useNotifications();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [selected, setSelected] = useState<Notification | null>(null);

  const visible = useMemo(
    () => (filter === "unread" ? notifications.filter((n) => !n.read) : notifications),
    [notifications, filter]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center animate-drop-in">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {unreadCount} unread · {total} total
          </p>
        </div>
        <button
          type="button"
          onClick={() => void markAllAsRead()}
          disabled={unreadCount === 0}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Check className="h-4 w-4" />
          Mark all as read
        </button>
      </div>

      <div className="flex gap-2 animate-drop-in" style={{ animationDelay: "120ms" }}>
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              filter === f
                ? "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            )}
          >
            {f === "all" ? "All" : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      <div
        className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900 animate-drop-in"
        style={{ animationDelay: "240ms" }}
      >
        {visible.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-400 dark:text-slate-500">
            <BellOff className="h-8 w-8" />
            <p className="text-sm">{loading ? "Loading notifications…" : "No notifications to show."}</p>
          </div>
        )}
        {visible.map((n) => {
          const Icon = iconFor(n.type);
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                void markAsRead(n.id);
                setSelected(n);
              }}
              className={cn(
                "flex w-full cursor-pointer items-start gap-3 px-5 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60",
                !n.read && "bg-blue-50/40 dark:bg-blue-500/[0.04]"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  chipFor(n.type)
                )}
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      "truncate text-sm",
                      !n.read
                        ? "font-semibold text-slate-900 dark:text-white"
                        : "font-medium text-slate-600 dark:text-slate-300"
                    )}
                  >
                    {n.title}
                  </p>
                  {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />}
                </div>
                <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{n.message}</p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{formatNotificationTime(n.createdAt)}</p>
              </div>
            </button>
          );
        })}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Load more
          </button>
        </div>
      )}

      {selected && (
        <NotificationDetailModal notification={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
