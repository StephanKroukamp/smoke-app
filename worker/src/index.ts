import { verifyFirebaseIdToken } from "./verifyFirebaseToken";
import { getFcmAccessToken } from "./gcpAccessToken";
import { firestoreGet, setServiceAccountJsonForFirestore } from "./firestore";
import { sendFcm } from "./fcm";

export interface Env {
  FIREBASE_PROJECT_ID: string;
  GCP_SERVICE_ACCOUNT_JSON: string; // JSON string
  ALLOWED_ORIGIN?: string;
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, init: ResponseInit = {}, env?: Env): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(env ? corsHeaders(env) : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

async function readBearer(req: Request): Promise<string | null> {
  const h = req.headers.get("Authorization");
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice("Bearer ".length);
}

type UserDoc = {
  displayName?: string;
  fcmTokens?: Record<string, { platform?: string }>;
};

type SmokeDoc = {
  groupId: string;
  initiatorUid: string;
  durationMinutes: number;
  responses?: Record<string, { status: "accepted" | "denied" }>;
};

type GroupDoc = {
  name: string;
  memberUids: string[];
};

async function handlePushSmoke(req: Request, env: Env): Promise<Response> {
  const idToken = await readBearer(req);
  if (!idToken) return json({ error: "missing bearer" }, { status: 401 }, env);

  const claims = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!claims) return json({ error: "invalid token" }, { status: 401 }, env);

  const { smokeId } = (await req.json()) as { smokeId?: string };
  if (!smokeId) return json({ error: "smokeId required" }, { status: 400 }, env);

  const smoke = await firestoreGet<SmokeDoc>(env.FIREBASE_PROJECT_ID, `smokes/${smokeId}`);
  if (!smoke) return json({ error: "smoke not found" }, { status: 404 }, env);
  if (smoke.initiatorUid !== claims.sub) {
    return json({ error: "not initiator" }, { status: 403 }, env);
  }

  const group = await firestoreGet<GroupDoc>(env.FIREBASE_PROJECT_ID, `groups/${smoke.groupId}`);
  if (!group) return json({ error: "group not found" }, { status: 404 }, env);

  const initiator = await firestoreGet<UserDoc>(env.FIREBASE_PROJECT_ID, `users/${smoke.initiatorUid}`);
  const initiatorName = initiator?.displayName || "Someone";

  const accessToken = await getFcmAccessToken(env.GCP_SERVICE_ACCOUNT_JSON);

  const recipients = group.memberUids.filter((uid) => uid !== smoke.initiatorUid);
  const tokens: string[] = [];
  for (const uid of recipients) {
    const user = await firestoreGet<UserDoc>(env.FIREBASE_PROJECT_ID, `users/${uid}`);
    if (user?.fcmTokens) tokens.push(...Object.keys(user.fcmTokens));
  }

  const title = `🚬 ${initiatorName} raised the flag`;
  const body = `${group.name} · ${smoke.durationMinutes} min to respond`;

  const results = await Promise.allSettled(
    tokens.map((t) =>
      sendFcm(env.FIREBASE_PROJECT_ID, accessToken, t, title, body, {
        smokeId,
        groupId: smoke.groupId,
      })
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;
  return json({ sent, failed }, {}, env);
}

async function handlePushResponse(req: Request, env: Env): Promise<Response> {
  const idToken = await readBearer(req);
  if (!idToken) return json({ error: "missing bearer" }, { status: 401 }, env);

  const claims = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!claims) return json({ error: "invalid token" }, { status: 401 }, env);

  const { smokeId, status } = (await req.json()) as {
    smokeId?: string;
    status?: "accepted" | "denied";
  };
  if (!smokeId || !status) return json({ error: "smokeId and status required" }, { status: 400 }, env);

  const smoke = await firestoreGet<SmokeDoc>(env.FIREBASE_PROJECT_ID, `smokes/${smokeId}`);
  if (!smoke) return json({ error: "smoke not found" }, { status: 404 }, env);

  // Confirm the response was actually recorded (prevents spoofed pushes).
  const recorded = smoke.responses?.[claims.sub]?.status;
  if (recorded !== status) return json({ error: "response not recorded" }, { status: 409 }, env);

  const initiator = await firestoreGet<UserDoc>(env.FIREBASE_PROJECT_ID, `users/${smoke.initiatorUid}`);
  if (!initiator?.fcmTokens) return json({ sent: 0 }, {}, env);

  const responder = await firestoreGet<UserDoc>(env.FIREBASE_PROJECT_ID, `users/${claims.sub}`);
  const responderName = responder?.displayName || "Someone";

  const accessToken = await getFcmAccessToken(env.GCP_SERVICE_ACCOUNT_JSON);
  const title = status === "accepted" ? `✅ ${responderName} accepted` : `❌ ${responderName} declined`;
  const body = "";

  const tokens = Object.keys(initiator.fcmTokens);
  const results = await Promise.allSettled(
    tokens.map((t) =>
      sendFcm(env.FIREBASE_PROJECT_ID, accessToken, t, title, body, {
        smokeId,
        groupId: smoke.groupId,
      })
    )
  );
  return json({ sent: results.filter((r) => r.status === "fulfilled").length }, {}, env);
}

async function handlePushTest(req: Request, env: Env): Promise<Response> {
  const idToken = await readBearer(req);
  if (!idToken) return json({ error: "missing bearer" }, { status: 401 }, env);

  const claims = await verifyFirebaseIdToken(idToken, env.FIREBASE_PROJECT_ID);
  if (!claims) return json({ error: "invalid token" }, { status: 401 }, env);

  const user = await firestoreGet<UserDoc>(env.FIREBASE_PROJECT_ID, `users/${claims.sub}`);
  const tokens = user?.fcmTokens ? Object.keys(user.fcmTokens) : [];
  if (tokens.length === 0) {
    return json({ error: "no tokens registered for this user", tokenCount: 0 }, { status: 404 }, env);
  }

  const accessToken = await getFcmAccessToken(env.GCP_SERVICE_ACCOUNT_JSON);
  const results = await Promise.allSettled(
    tokens.map((t) =>
      sendFcm(
        env.FIREBASE_PROJECT_ID,
        accessToken,
        t,
        "🧪 Smoke Break test",
        "If you see this, push notifications are working on this device.",
        {}
      )
    )
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  const errors = results
    .filter((r) => r.status === "rejected")
    .map((r) => (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason));
  return json({ tokenCount: tokens.length, sent, failed: tokens.length - sent, errors }, {}, env);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(env) });
    const url = new URL(req.url);

    setServiceAccountJsonForFirestore(env.GCP_SERVICE_ACCOUNT_JSON);

    try {
      if (req.method === "POST" && url.pathname === "/push-smoke") {
        return await handlePushSmoke(req, env);
      }
      if (req.method === "POST" && url.pathname === "/push-response") {
        return await handlePushResponse(req, env);
      }
      if (req.method === "POST" && url.pathname === "/push-test") {
        return await handlePushTest(req, env);
      }
      return json({ error: "not found" }, { status: 404 }, env);
    } catch (e) {
      console.error(e);
      return json({ error: e instanceof Error ? e.message : "internal error" }, { status: 500 }, env);
    }
  },
};
