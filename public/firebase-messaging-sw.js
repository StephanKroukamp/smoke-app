/* Firebase Cloud Messaging background handler.
 * Served at /firebase-messaging-sw.js (site root) — required path for FCM.
 * NOTE: this runs outside the Vite bundle, so no imports from src/. Uses compat SDK via importScripts.
 * The Firebase config MUST match the one in src/firebase.ts. Update both together.
 */

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

// Keep this in sync with src/firebase.ts. These are public config values.
firebase.initializeApp({
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  appId: "__FIREBASE_APP_ID__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
});

// Server sends `webpush.notification` in the FCM message so the browser
// auto-displays notifications even when the SW is evicted. We intentionally
// do NOT call showNotification ourselves anymore — duplicating it would
// produce two notifications per push.
firebase.messaging();

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const smokeId = event.notification.data?.smokeId;
  const target = smokeId ? `/smoke/${smokeId}` : "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});
