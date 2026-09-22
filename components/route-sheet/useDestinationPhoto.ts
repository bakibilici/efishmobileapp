import { useCallback, useMemo, useState } from "react";

import type { RoutePlanData } from "../../services/DriveSessionStore";
import { getRoutePlanGatewayUrl } from "../../services/routePlanGateway";
import type { TitlePhoto } from "./Grouped";
import { destinationPhotoCredit, destinationPhotoUri } from "./placePhoto";

/** Read once: EXPO_PUBLIC_ vars are inlined at build time. */
const GATEWAY_URL = getRoutePlanGatewayUrl();

/**
 * The destination's photograph for the overview's TitleBlock, or null.
 *
 * Null is the ordinary answer, not an error: a plan with no photo, a stored or
 * previewed plan (the agent strips photos before saving one), a photo whose
 * signed URL has aged past the gateway's window, no network on a mountain
 * road. The header then renders exactly the tree it renders today, so there is
 * nothing to leave behind — hence a URL that failed is remembered rather than a
 * boolean: a new plan carries a new URL and starts clean, with no reset.
 *
 * Both sheets — the iOS 26 system sheet (app/route-sheet) and the gorhom one
 * (RoutePlanSheet) — call this, so the two paths cannot drift apart.
 */
export function useDestinationPhoto(
  plan: RoutePlanData | null | undefined,
): TitlePhoto | null {
  const uri = useMemo(() => destinationPhotoUri(plan, GATEWAY_URL), [plan]);
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const shown = uri && uri !== failedUri ? uri : null;
  const onError = useCallback(() => setFailedUri(shown), [shown]);
  const credit = shown ? destinationPhotoCredit(plan) : null;
  return useMemo(
    () => (shown ? { uri: shown, credit, onError } : null),
    [shown, credit, onError],
  );
}
