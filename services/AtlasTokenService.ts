/**
 * Client for the Atlas token server (atlas repo, apps/token-server).
 * Returns a LiveKit access token plus the ws(s) URL and room to join.
 *
 * The endpoint is per build profile, set as EXPO_PUBLIC_ATLAS_TOKEN_URL in
 * eas.json. Metro inlines it at build time, so a release binary carries
 * whatever the profile said — there is no runtime override.
 *
 * Note on the shared secret: EXPO_PUBLIC_* values are inlined into the bundle
 * and are therefore extractable from a shipped app. This is a deliberate,
 * documented prototype-grade compromise; the real fix is for the token server
 * to verify this app's own backend token and derive the identity from it
 * rather than trusting what the client sends.
 */

export interface AtlasTokenResponse {
  token: string;
  url: string;
  room: string;
}

export type AtlasTokenErrorKind =
  /** The build is misconfigured — retrying will never help. */
  | "config"
  /** The shared secret is missing or wrong. Retrying will never help. */
  | "unauthorized"
  /** The request took too long. Worth retrying. */
  | "timeout"
  /** The server answered 5xx. Worth retrying. */
  | "server"
  /** DNS, TLS or connectivity. Worth retrying. */
  | "network"
  /** A 2xx body that is not what we expect. */
  | "malformed";

export class AtlasTokenError extends Error {
  readonly kind: AtlasTokenErrorKind;
  readonly status?: number;

  constructor(kind: AtlasTokenErrorKind, message: string, status?: number) {
    super(message);
    this.name = "AtlasTokenError";
    this.kind = kind;
    this.status = status;
  }

  /** Whether a second attempt could plausibly succeed. */
  get retryable(): boolean {
    return this.kind === "timeout" || this.kind === "server" || this.kind === "network";
  }
}

const REQUEST_TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 1200;

/** Only used when running against a local stack; never in a release build. */
const DEV_FALLBACK_TOKEN_URL = "http://localhost:7890/api/token";

export function getAtlasTokenUrl(): string {
  const raw = process.env.EXPO_PUBLIC_ATLAS_TOKEN_URL?.trim();

  if (!raw) {
    if (__DEV__) return DEV_FALLBACK_TOKEN_URL;
    // Falling back to localhost in a release build is how a shipped app ends
    // up talking to nothing at all, silently. Fail loudly instead.
    throw new AtlasTokenError(
      "config",
      "EXPO_PUBLIC_ATLAS_TOKEN_URL is not set. Configure it per build profile in eas.json.",
    );
  }

  // iOS ATS and the Android release manifest both refuse cleartext to a public
  // host, so an http:// endpoint in a release build cannot work anyway.
  if (!__DEV__ && !raw.startsWith("https://")) {
    throw new AtlasTokenError(
      "config",
      `EXPO_PUBLIC_ATLAS_TOKEN_URL must be an https:// URL in a release build, got "${raw}".`,
    );
  }

  return raw;
}

function getSharedSecret(): string | null {
  const secret = process.env.EXPO_PUBLIC_ATLAS_TOKEN_SECRET?.trim();
  if (secret) return secret;

  if (!__DEV__) {
    // The server requires the header; without it every request is a 401.
    throw new AtlasTokenError(
      "config",
      "EXPO_PUBLIC_ATLAS_TOKEN_SECRET is not set. Add it as an EAS environment variable for this profile.",
    );
  }
  return null;
}

/** The URL the server hands back is what we hand to LiveKit, so validate it. */
function assertUsableRealtimeUrl(url: string): void {
  if (__DEV__) return;
  if (!url.startsWith("wss://")) {
    throw new AtlasTokenError(
      "config",
      `Token server returned a non-TLS realtime URL ("${url}"); refusing to connect.`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOnce(options: {
  identity: string;
  language: string;
  newSession: boolean;
  resumeSessionId?: string | null;
}): Promise<AtlasTokenResponse> {
  const params = new URLSearchParams({
    identity: options.identity,
    language: options.language,
  });
  if (options.newSession) {
    params.set("new_session", "true");
  } else if (options.resumeSessionId) {
    params.set("resume_session_id", options.resumeSessionId);
  }

  const headers: Record<string, string> = {};
  const secret = getSharedSecret();
  if (secret) headers["x-atlas-token-secret"] = secret;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${getAtlasTokenUrl()}?${params.toString()}`, {
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof AtlasTokenError) throw error;
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new AtlasTokenError(
      aborted ? "timeout" : "network",
      aborted
        ? `Token server did not answer within ${REQUEST_TIMEOUT_MS} ms.`
        : `Could not reach the token server: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 401 || response.status === 403) {
    throw new AtlasTokenError("unauthorized", "Token server rejected the shared secret.", response.status);
  }
  if (response.status >= 500) {
    throw new AtlasTokenError("server", `Token server responded ${response.status}.`, response.status);
  }
  if (!response.ok) {
    throw new AtlasTokenError("config", `Token server responded ${response.status}.`, response.status);
  }

  let data: Partial<AtlasTokenResponse>;
  try {
    data = (await response.json()) as Partial<AtlasTokenResponse>;
  } catch {
    throw new AtlasTokenError("malformed", "Token server returned a body that is not JSON.");
  }
  if (!data.token || !data.url || !data.room) {
    throw new AtlasTokenError("malformed", "Token server returned an incomplete response.");
  }

  assertUsableRealtimeUrl(data.url);
  return { token: data.token, url: data.url, room: data.room };
}

export async function fetchAtlasToken(options: {
  identity: string;
  language?: string;
  newSession?: boolean;
  /** Ask the agent to resume this specific session instead of the newest one. */
  resumeSessionId?: string | null;
}): Promise<AtlasTokenResponse> {
  const request = {
    identity: options.identity,
    language: options.language ?? "tr",
    newSession: options.newSession ?? false,
    resumeSessionId: options.resumeSessionId ?? null,
  };

  try {
    return await requestOnce(request);
  } catch (error) {
    // One retry, and only for the failures a retry can actually fix. A bad
    // secret or a missing URL would just fail again a second later.
    if (error instanceof AtlasTokenError && error.retryable) {
      await sleep(RETRY_DELAY_MS);
      return requestOnce(request);
    }
    throw error;
  }
}
