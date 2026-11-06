"use client";

import { useCallback, useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const read = () => decodeURIComponent(window.location.hash.slice(1)) || null;

/** Record id in the URL hash, so exception links can open a specific record and the sheet survives reload. */
export function useHashId(): [string | null, (id: string | null) => void] {
  const id = useSyncExternalStore(subscribe, read, () => null);
  const set = useCallback((next: string | null) => {
    history.replaceState(null, "", next ? `#${encodeURIComponent(next)}` : window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }, []);
  return [id, set];
}
