/**
 * Minimal Firestore REST reader for the Worker.
 *
 * Uses the public documents endpoint with Firestore security rules bypassed only for reads
 * — wait, no: unauthenticated Firestore REST calls are subject to security rules, which
 * deny our reads because we aren't signed in. We have two choices:
 *
 *   A) Authenticate to Firestore REST using the same service account (scope
 *      https://www.googleapis.com/auth/datastore). Then we read as admin, bypassing rules.
 *   B) Pass the caller's Firebase ID token through.
 *
 * We use (A): the Worker already holds the service account, and admin reads are what we
 * want anyway for sending pushes. This keeps the security boundary clean: the Worker
 * re-validates the caller's intent itself (checks initiator, checks response recorded).
 */

const DATASTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

type CachedToken = { token: string; expiresAt: number };
let datastoreTokenCache: CachedToken | null = null;

let cachedServiceAccountJson: string | null = null;

export function setServiceAccountJsonForFirestore(json: string) {
  cachedServiceAccountJson = json;
}

/** Gets a Google OAuth token scoped for Firestore admin reads (reusing the same SA key). */
async function getDatastoreAccessToken(): Promise<string> {
  if (!cachedServiceAccountJson) throw new Error("Service account not initialized");
  const now = Math.floor(Date.now() / 1000);
  if (datastoreTokenCache && datastoreTokenCache.expiresAt - 60 > now) {
    return datastoreTokenCache.token;
  }

  const sa = JSON.parse(cachedServiceAccountJson) as {
    client_email: string;
    private_key: string;
    token_uri: string;
  };

  const enc = new TextEncoder();
  const b64url = (b: ArrayBuffer | Uint8Array) => {
    const arr = b instanceof Uint8Array ? b : new Uint8Array(b);
    let s = "";
    for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const pemDer = (pem: string) => {
    const body = pem
      .replace(/-----BEGIN PRIVATE KEY-----/g, "")
      .replace(/-----END PRIVATE KEY-----/g, "")
      .replace(/\s/g, "");
    const bin = atob(body);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf.buffer;
  };

  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: DATASTORE_SCOPE,
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  };
  const hb = b64url(enc.encode(JSON.stringify(header)));
  const cb = b64url(enc.encode(JSON.stringify(claims)));
  const signInput = `${hb}.${cb}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(signInput));
  const jwt = `${signInput}.${b64url(sig)}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Datastore token exchange failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  datastoreTokenCache = { token: body.access_token, expiresAt: now + body.expires_in };
  return body.access_token;
}

/**
 * Convert a Firestore REST document into a plain JS object.
 * Firestore REST wraps values in typed envelopes: { stringValue, integerValue, mapValue, arrayValue, ... }
 */
function decodeValue(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  const obj = v as Record<string, unknown>;
  if ("stringValue" in obj) return obj.stringValue;
  if ("integerValue" in obj) return Number(obj.integerValue);
  if ("doubleValue" in obj) return obj.doubleValue;
  if ("booleanValue" in obj) return obj.booleanValue;
  if ("nullValue" in obj) return null;
  if ("timestampValue" in obj) return obj.timestampValue;
  if ("arrayValue" in obj) {
    const arr = (obj.arrayValue as { values?: unknown[] }).values ?? [];
    return arr.map(decodeValue);
  }
  if ("mapValue" in obj) {
    const fields = (obj.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(fields)) out[k] = decodeValue(val);
    return out;
  }
  return v;
}

function decodeDocument<T>(doc: { fields?: Record<string, unknown> } | null): T | null {
  if (!doc || !doc.fields) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields)) out[k] = decodeValue(v);
  return out as T;
}

/**
 * Read a document at `collection/docId` (or deeper path).
 * Note: this uses the SA's datastore token, so it bypasses Firestore security rules.
 * Do not call with a path from user input unless validated.
 */
export async function firestoreGet<T>(projectId: string, path: string): Promise<T | null> {
  const token = await getDatastoreAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore read failed: ${res.status} ${await res.text()}`);
  const doc = (await res.json()) as { fields?: Record<string, unknown> };
  return decodeDocument<T>(doc);
}

/**
 * Delete specific map keys under `users/{uid}.fcmTokens`. Uses Firestore REST
 * PATCH with an updateMask targeting `fcmTokens.<tokenKey>`; omitting those
 * fields from the body is how Firestore removes them.
 *
 * Firestore map-key field paths with special characters must be backtick-quoted.
 * FCM tokens contain `:`, `/`, `-`, `_` — `:` and `/` trigger the quote rule.
 */
export async function deleteUserFcmTokens(
  projectId: string,
  uid: string,
  tokens: string[]
): Promise<void> {
  if (tokens.length === 0) return;
  const accessToken = await getDatastoreAccessToken();
  const params = new URLSearchParams();
  for (const t of tokens) params.append("updateMask.fieldPaths", `fcmTokens.\`${t}\``);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?${params.toString()}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: {} }),
  });
  if (!res.ok) {
    throw new Error(`Firestore token cleanup failed: ${res.status} ${await res.text()}`);
  }
}
