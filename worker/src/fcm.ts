export type SendFcmResult =
  | { ok: true }
  | { ok: false; dead: true; status: number; body: string }
  | { ok: false; dead: false; status: number; body: string };

export async function sendFcm(
  projectId: string,
  accessToken: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<SendFcmResult> {
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  // Data-only message: the service worker (firebase-messaging-sw.js) renders the notification.
  // A `notification` block here would make FCM auto-display a second notification alongside
  // the one our service worker shows — the bug users reported.
  const payload: Record<string, string> = {
    title,
    body,
    ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
  };
  const message = {
    message: {
      token,
      data: payload,
      webpush: {
        fcm_options: { link: data.smokeId ? `/smoke/${data.smokeId}` : "/" },
      },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(message),
  });

  if (res.ok) return { ok: true };

  const respBody = await res.text();
  // https://firebase.google.com/docs/cloud-messaging/manage-tokens
  // 404 UNREGISTERED → token was valid once, now dead. 400 INVALID_ARGUMENT with
  // errorCode INVALID_ARGUMENT → malformed token; also not recoverable.
  const dead =
    res.status === 404 ||
    /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(respBody);
  return { ok: false, dead, status: res.status, body: respBody };
}
