import { useCallback, useEffect, useState } from "react";

/**
 * On-demand loading for data providers. Providers stay mounted for the whole
 * dashboard session (see components/providers.tsx), but a provider only
 * fetches once something on screen actually reads it — so opening the
 * Repairs page loads repairs (and what that page uses), not all ~18 datasets.
 *
 * Provider:
 *   const [requested, requestLoad] = useLoadOnDemand();
 *   useEffect(() => { if (requested) void refresh(); }, [requested]);
 *   ...expose requestLoad in the context value
 *
 * Consumer hook:
 *   export function useThings(options?: LoadOptions) {
 *     const ctx = useContext(ThingsContext);
 *     useRequestLoad(ctx?.requestLoad, options);
 *     ...
 *   }
 *
 * `requested` flips to true once and stays true, so the load effect runs a
 * single time per session (StrictMode's dev double-effect included: React
 * keeps state across its simulated remount).
 */
export function useLoadOnDemand(): [boolean, () => void] {
  const [requested, setRequested] = useState(false);
  const requestLoad = useCallback(() => setRequested(true), []);
  return [requested, requestLoad];
}

export type LoadOptions = {
  /** false = read whatever is already loaded without triggering a fetch
   *  (e.g. the topbar search, which requests data only once you type). */
  load?: boolean;
};

export function useRequestLoad(requestLoad: (() => void) | undefined, options?: LoadOptions) {
  const load = options?.load ?? true;
  useEffect(() => {
    if (load) requestLoad?.();
  }, [load, requestLoad]);
}
