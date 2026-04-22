import { deleteToken, getToken } from "firebase/messaging";
import { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { deleteInstallations, getInstallations } from "firebase/installations";
import { app, db, getMessagingIfSupported, VAPID_KEY } from "../firebase";

function platformHint(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "web";
}

export async function registerPushForUser(uid: string): Promise<string | null> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;

  if (Notification.permission === "denied") return null;
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return null;
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

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
      token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
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
