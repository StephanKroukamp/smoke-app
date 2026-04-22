import { Capacitor } from "@capacitor/core";
import { deleteToken, getToken } from "firebase/messaging";
import { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { deleteInstallations, getInstallations } from "firebase/installations";
import { app, db, getMessagingIfSupported } from "../firebase";
import { registerPushNative } from "./registerPushNative";

function platformHint(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "web";
}

export async function registerPushForUser(uid: string): Promise<string | null> {
  // Inside the Android APK (Capacitor) we use native FCM via the push plugin —
  // that's the whole reason for shipping a native wrapper. Web push code below
  // stays the same and runs in the browser / PWA.
  if (Capacitor.isNativePlatform()) {
    return registerPushNative(uid);
  }

  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;

  if (Notification.permission === "denied") return null;
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return null;
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

  // Force any existing PushSubscription to be thrown out. The endpoint URL is
  // cryptographically tied to the applicationServerKey used when subscribe()
  // was first called; if that was a now-incorrect VAPID key, FCM register will
  // 401 forever with "missing authentication credential" — silently. The
  // Firebase SDK doesn't reliably unsubscribe+resubscribe when the key changes,
  // so we do it ourselves.
  try {
    if (registration.active || registration.waiting || registration.installing) {
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
    }
  } catch {
    /* ignore */
  }

  // FCM register can 401 with "missing authentication credential" when the
  // Firebase installation attached to this device is broken server-side
  // (e.g. never fully propagated, or orphaned from a previous project state).
  // Plain getToken() retries don't help — the SDK keeps reusing the same FID.
  // Force a fresh installation between attempts by calling deleteInstallations,
  // which wipes the FID locally and server-side. The next getToken creates a
  // brand new installation.
  let token: string | null = null;
  let lastErr: unknown = null;
  const installations = getInstallations(app);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Intentionally NOT passing a custom vapidKey. Firebase's SDK only
      // sends the applicationPubKey field to FCM register when a custom
      // VAPID is set, and that field triggers FCM's server-side auth check
      // which has been returning 401 "missing authentication credential"
      // for this project. Using the SDK's built-in default VAPID skips that
      // field entirely. Server-side sending still works because the Worker
      // uses a service account (FCM HTTP v1) — VAPID key is irrelevant there.
      token = await getToken(messaging, {
        serviceWorkerRegistration: registration,
      });
      if (token) break;
    } catch (e) {
      lastErr = e;
    }
    try {
      await deleteInstallations(installations);
    } catch {
      /* ignore — nothing to delete on first attempt */
    }
    try {
      await deleteToken(messaging);
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 300 + attempt * 200));
  }
  if (!token) {
    if (lastErr) throw lastErr;
    return null;
  }

  await setDoc(
    doc(db, "users", uid),
    { fcmTokens: { [token]: { platform: platformHint(), createdAt: serverTimestamp() } } },
    { merge: true }
  );

  return token;
}

/**
 * Nuke the user's current FCM registration and start fresh.
 *
 * Clears all saved fcmTokens in Firestore, deletes the browser-side token (so
 * Firebase generates a new one next time), and re-registers. Use this when a
 * device is failing to receive pushes — most commonly because of a stale token
 * from a previous install or a prior desktop session.
 */
export async function resetPushForUser(uid: string): Promise<string | null> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;
  try {
    await deleteToken(messaging);
  } catch {
    /* already gone, ignore */
  }
  try {
    await updateDoc(doc(db, "users", uid), { fcmTokens: deleteField() });
  } catch {
    /* ignore — maybe no tokens field */
  }
  return registerPushForUser(uid);
}

export async function countStoredTokens(uid: string): Promise<number> {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return 0;
  const tokens = snap.data().fcmTokens;
  if (!tokens || typeof tokens !== "object") return 0;
  return Object.keys(tokens).length;
}
