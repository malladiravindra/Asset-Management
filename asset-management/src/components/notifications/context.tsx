"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { fromBackend, type BackendNotification, type Notification } from "@/components/notifications/data";

type NotificationPage = {
  count: number;
  next: string | null;
  unread_count: number;
  results: BackendNotification[];
};

type NotificationsContextValue = {
  notifications: Notification[];
  /** The caller's total unread count, straight from the backend. */
  unreadCount: number;
  /** Total notifications on the server (may exceed what is loaded). */
  total: number;
  hasMore: boolean;
  loading: boolean;
  loadMore: () => Promise<void>;
  /** Re-fetch if the loaded data is older than maxAgeMs (default: always). */
  revalidate: (maxAgeMs?: number) => void;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const PAGE_SIZE = 20;
// Background re-checks (route change, tab focus) at most this often.
const STALE_AFTER_MS = 60_000;
// The pre-backend feed kept read state here; it is no longer used.
const LEGACY_READ_STORAGE_KEY = "assetflow.notifications.read";

/**
 * The single frontend owner of notification state. Everything comes from
 * the database via GET /api/notifications/ (only the signed-in user's rows —
 * the backend scopes it); read state is written back with PATCH …/read/ and
 * POST read-all/. Nothing is generated or stored in the browser.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const loadedAt = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const notificationsRef = useRef<Notification[]>([]);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  const fetchFirstPage = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    inFlight.current = apiGet<NotificationPage>(`/notifications/?page_size=${PAGE_SIZE}`)
      .then((page) => {
        setNotifications(page.results.map(fromBackend));
        setUnreadCount(page.unread_count);
        setTotal(page.count);
        setNextPage(page.next ? 2 : null);
        loadedAt.current = Date.now();
      })
      .catch(() => {
        // Keep whatever was shown; the next revalidation retries.
      })
      .finally(() => {
        inFlight.current = null;
        setLoading(false);
      });
    return inFlight.current;
  }, []);

  const revalidate = useCallback(
    (maxAgeMs = 0) => {
      if (Date.now() - loadedAt.current >= maxAgeMs) void fetchFirstPage();
    },
    [fetchFirstPage]
  );

  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_READ_STORAGE_KEY);
    } catch {
      // storage unavailable — nothing to clean up
    }
  }, []);

  // First load on mount, then a background re-check on navigation (at most
  // once a minute) so notifications created by other users' actions or by
  // the scheduled generate_notifications job show up without a reload.
  useEffect(() => {
    revalidate(STALE_AFTER_MS);
  }, [pathname, revalidate]);

  useEffect(() => {
    function onFocus() {
      revalidate(STALE_AFTER_MS);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [revalidate]);

  const loadMore = useCallback(async () => {
    if (!nextPage) return;
    const page = await apiGet<NotificationPage>(`/notifications/?page_size=${PAGE_SIZE}&page=${nextPage}`);
    setNotifications((prev) => {
      const seen = new Set(prev.map((n) => n.id));
      return [...prev, ...page.results.map(fromBackend).filter((n) => !seen.has(n.id))];
    });
    setUnreadCount(page.unread_count);
    setTotal(page.count);
    setNextPage(page.next ? nextPage + 1 : null);
  }, [nextPage]);

  const markAsRead = useCallback(async (id: number) => {
    if (notificationsRef.current.some((n) => n.id === id && n.read)) return;
    const updated = fromBackend(await apiPatch<BackendNotification>(`/notifications/${id}/read/`, {}));
    setNotifications((prev) => prev.map((n) => (n.id === id ? updated : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    await apiPost<{ updated: number; unread_count: number }>("/notifications/read-all/", {});
    setNotifications((prev) => prev.map((n) => (n.read ? n : { ...n, read: true })));
    setUnreadCount(0);
  }, []);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        total,
        hasMore: nextPage !== null,
        loading,
        loadMore,
        revalidate,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider");
  return ctx;
}
