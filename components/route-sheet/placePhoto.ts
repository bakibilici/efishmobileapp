/**
 * The route sheet's photographs — a break suggestion's place and the
 * destination — as plain helpers: no React Native imports, so
 * scripts/check-break-detail.ts runs them under tsx.
 *
 * Both photos arrive the same way: the gateway sends a path on its own origin,
 * signed and short-lived, and gatewayPhotoUri is the one place that turns such
 * a path into a URL. Keeping that rule in a single function is the point of
 * this module: a second copy of it is a second chance to load a photograph
 * from somewhere the gateway never signed.
 */
import type { RoutePlanData } from "../../services/DriveSessionStore";

/** The one endpoint a photo may ever come from. */
const PHOTO_PATH = "/api/place-photo?";
const HTTPS = "https://";
/**
 * Well past the gateway's own reference cap; only keeps a nonsense value out.
 *
 * Exported because the store's intake caps the same value on the way in
 * (services/routePlanGateway): one number, so a path can never pass the cap
 * that admits it to the store and then fail the cap that would draw it — a
 * photo that silently never appears — or the reverse.
 */
export const PHOTO_URL_MAX = 1200;

/**
 * Text worth showing: trimmed, and only when it has a letter or a digit. Place
 * data sometimes names an option "." or ",", which used to show up as
 * "Diğer: ., Shell". It lives here because both photo credits read it, and
 * breakDetail shares it for an alternative's name.
 */
export const readable = (text: string | null | undefined): string | null => {
  const trimmed = text?.trim();
  return trimmed && /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : null;
};

/**
 * A photo the gateway sent, as a full https URL on the app's own gateway. The
 * payload only ever carries a path, and what it carries is rewritten onto the
 * configured gateway's origin rather than trusted: the agent and the app can be
 * pointed at different deployments, and a photo that silently never loaded
 * would be much harder to see than one from the wrong host. A path that is not
 * this endpoint, or a gateway that is not https, gives null.
 *
 * Built with string operations, not URL(): Hermes' URL is incomplete.
 */
export const gatewayPhotoUri = (
  rawUrl: string | null | undefined,
  gatewayUrl: string,
): string | null => {
  const raw = rawUrl?.trim();
  if (!raw || raw.length > PHOTO_URL_MAX) return null;
  const at = raw.startsWith(PHOTO_PATH)
    ? 0
    : raw.startsWith(HTTPS) && raw.indexOf(PHOTO_PATH) > HTTPS.length
      ? raw.indexOf(PHOTO_PATH)
      : -1;
  if (at < 0) return null;
  const cut = gatewayUrl.indexOf("/api/route-plan");
  if (cut < 0) return null;
  const origin = gatewayUrl.slice(0, cut);
  // http:// is refused rather than special-cased: "http://localhost.evil.com"
  // passes any naive prefix test, and dev against the deployed gateway works.
  if (!origin.startsWith(HTTPS)) return null;
  return `${origin}${raw.slice(at)}`;
};

/**
 * The destination's own photograph, when the place the driver named has one.
 * Null for every plan that carries none: a place Google has no photo for, a
 * destination that came from the geocoding fallback, a gateway with its photos
 * switched off, and every stored plan — a signed URL expires within a day or
 * two, so both sides strip photos before saving a session (the agent's
 * withoutPhotos, the app's withoutPhotosInPlan in services/routePlanGateway).
 * The header then keeps exactly the layout it has always had.
 */
export const destinationPhotoUri = (
  plan: Pick<RoutePlanData, "destination_photo_url"> | null | undefined,
  gatewayUrl: string,
): string | null => gatewayPhotoUri(plan?.destination_photo_url, gatewayUrl);

/**
 * "Ayşe K." for the credit beside the destination's title, or null. Google
 * requires the attribution wherever its photo is shown; many places come
 * without one, and an uncredited photo is a legitimate one.
 */
export const destinationPhotoCredit = (
  plan: Pick<RoutePlanData, "destination_photo_attribution"> | null | undefined,
): string | null => readable(plan?.destination_photo_attribution);
