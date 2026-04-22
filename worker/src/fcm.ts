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
        // FCM auto-displays this on the device, so notifications arrive even
        // when the service worker is evicted / asleep. We still send `data`
        // so our SW's onBackgroundMessage can enrich when it runs.
        notification: {
          title,
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: data.smokeId || "smoke",
        },
        fcm_options: { link: data.smokeId ? `/smoke/${data.smokeId}` : "/" },
        headers: { Urgency: "high", TTL: "86400" },
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
