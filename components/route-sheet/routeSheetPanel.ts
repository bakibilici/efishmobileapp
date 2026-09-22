import { useEffect, useSyncExternalStore } from "react";

/**
 * Whether the route sheet (either one: the system sheet on iOS 26, the
 * gorhom sheet elsewhere) shows one of its inner panels, the stops or a
 * break's page. Their back chevron is a step inside the sheet, so while one
 * is open car mode hides its own "Oturumlara dön" (the header's, and the
 * floating one over the system sheet): one way back at a time.
 */
let innerPanelOpen = false;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const setInnerPanelOpen = (open: boolean) => {
  if (open === innerPanelOpen) return;
  innerPanelOpen = open;
  listeners.forEach((listener) => listener());
};

/** The sheet reports its panel; unmounting it reports the overview again. */
export function useReportRouteSheetPanel(isInnerPanel: boolean) {
  useEffect(() => {
    setInnerPanelOpen(isInnerPanel);
  }, [isInnerPanel]);
  useEffect(() => () => setInnerPanelOpen(false), []);
}

export const useRouteSheetInnerPanelOpen = () =>
  useSyncExternalStore(subscribe, () => innerPanelOpen);
