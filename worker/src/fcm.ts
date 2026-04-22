/**
 * Send a single FCM message via the HTTP v1 API.
 * Non-2xx responses bubble up as errors. Token cleanup (on 404 UNREGISTERED) is not
 * implemented here — could be added later by deleting the token field from the user doc.
 */

export async function sendFcm(
  projectId: string,
  accessToken: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<void> {
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

  if (!res.ok) {
    throw new Error(`FCM send failed: ${res.status} ${await res.text()}`);
  }
}
