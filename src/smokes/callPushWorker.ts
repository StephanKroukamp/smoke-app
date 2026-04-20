import { auth, PUSH_WORKER_URL } from "../firebase";

async function post(path: string, body: unknown): Promise<Response | null> {
  if (!PUSH_WORKER_URL) {
    console.warn("PUSH_WORKER_URL not set — skipping push notification.");
    return null;
  }
  const user = auth.currentUser;
  if (!user) return null;
  const token = await user.getIdToken();
  try {
    return await fetch(`${PUSH_WORKER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("Push worker call failed", e);
    return null;
  }
}

export function notifyGroupSmoke(smokeId: string) {
  return post("/push-smoke", { smokeId });
}

export function notifyInitiatorResponse(smokeId: string, status: "accepted" | "denied") {
  return post("/push-response", { smokeId, status });
}

export async function sendSelfTestPush(): Promise<{
  ok: boolean;
  tokenCount: number;
  sent: number;
  failed: number;
  errors: string[];
  message?: string;
}> {
  const res = await post("/push-test", {});
  if (!res) return { ok: false, tokenCount: 0, sent: 0, failed: 0, errors: [], message: "Worker unreachable" };
  const body = (await res.json().catch(() => null)) as {
    tokenCount?: number;
    sent?: number;
    failed?: number;
    errors?: string[];
    error?: string;
  } | null;
  if (!res.ok) {
    return {
      ok: false,
      tokenCount: body?.tokenCount ?? 0,
      sent: 0,
      failed: 0,
      errors: body?.errors ?? [],
      message: body?.error ?? `HTTP ${res.status}`,
    };
  }
  return {
    ok: true,
    tokenCount: body?.tokenCount ?? 0,
    sent: body?.sent ?? 0,
    failed: body?.failed ?? 0,
    errors: body?.errors ?? [],
  };
}
