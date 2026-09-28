"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TRANSITION_MS = 300;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Right-side slide-over panel for "create/edit" flows that need more room
 * than the centered `Modal` — a blurred overlay behind a fixed-width drawer
 * that slides in from the edge (Jira/Linear/ServiceNow-style), with a
 * sticky header and footer around a scrollable body.
 *
 * Stays mounted briefly after `open` flips false so the close transition can
 * play out instead of the panel just vanishing.
 *
 * Rendered through a portal straight onto `document.body`, for the same
 * reason as `Modal`: an ancestor holding a leftover `transform` from a
 * finished `animation-fill-mode: both` entrance animation (e.g. Catalog's
 * `.animate-unfold-in`) becomes this panel's containing block otherwise,
 * shrinking the "full-viewport, right-edge" drawer down to whatever box
 * that ancestor happens to occupy.
 */
export function Drawer({
  open,
  onClose,
  icon: Icon,
  iconClassName,
  title,
  description,
  children,
  footer,
  widthClassName = "w-full sm:w-[600px]",
}: {
  open: boolean;
  onClose: () => void;
  icon?: LucideIcon;
  /** Background/text classes for the header icon avatar, e.g. category color. */
  iconClassName?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  widthClassName?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const uid = useId();
  const titleId = `${uid}-drawer-title`;
  const descriptionId = `${uid}-drawer-description`;

  // Adjust state during render (React's documented pattern for reacting to a
  // prop change) rather than in an effect: mount immediately when opening,
  // and start the fade-out immediately when closing.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMounted(true);
    } else {
      setVisible(false);
    }
  }

  // Remember what had focus before opening, so it can be restored on close
  // (a ref write, not state — belongs in an effect, not the render above).
  useEffect(() => {
    if (open) previouslyFocused.current = document.activeElement as HTMLElement | null;
  }, [open]);

  // Flip to `visible` a frame after mounting so the enter transition (which
  // animates from the initial off-screen/hidden styles) actually plays.
  useEffect(() => {
    if (!open) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open]);

  // Keep rendering for one transition duration after close so the slide-out
  // actually plays, instead of the panel just vanishing.
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => setMounted(false), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Lock page scroll while the drawer is up, and restore focus to whatever
  // opened it once it's fully closed.
  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (!open) previouslyFocused.current?.focus?.();
    };
  }, [mounted, open]);

  // Esc to close, and auto-focus the first field once the panel has slid in.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    const focusTimer = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }, TRANSITION_MS);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  // Lightweight focus trap: wrap Tab/Shift+Tab within the panel.
  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity ease-out motion-reduce:transition-none",
          visible ? "opacity-100 duration-300" : "opacity-0 duration-200"
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onKeyDown={handleKeyDown}
        className={cn(
          "absolute inset-y-0 right-0 flex max-w-full flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-900/20 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none dark:border-slate-800 dark:bg-slate-900",
          widthClassName,
          visible ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <div className="flex min-w-0 items-center gap-3.5">
            {Icon && (
              <span
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  iconClassName ?? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-lg font-semibold text-slate-900 dark:text-white">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {description}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 outline-none transition hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>

        <div className="flex shrink-0 items-center justify-end gap-2.5 border-t border-slate-100 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          {footer}
        </div>
      </div>
    </div>,
    document.body
  );
}
