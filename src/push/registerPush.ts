import { deleteToken, getToken } from "firebase/messaging";
import { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db, getMessagingIfSupported, VAPID_KEY } from "../firebase";

function platformHint(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "web";
}

/**
 * Compare an existing PushSubscription's applicationServerKey (a DER-encoded
 * raw public key) to our current VAPID public key (base64url). If they differ,
 * the subscription is stale (we rotated VAPID) and must be cleared before
 * getToken() will succeed.
 */
function subscriptionKeyMatches(sub: PushSubscription, vapidKey: string): boolean {
  const key = sub.options?.applicationServerKey;
  if (!key) return false;
  const bytes = new Uint8Array(key);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64url = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return b64url === vapidKey;
}

async function clearStaleSubscription(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      const sub = await reg.pushManager.getSubscription();
      if (sub && !subscriptionKeyMatches(sub, VAPID_KEY)) {
        await sub.unsubscribe();
      }
    }
  } catch (e) {
    console.warn("clearStaleSubscription failed (non-fatal):", e);
  }
}

export async function registerPushForUser(uid: string): Promise<string | null> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) throw new Error("Messaging not supported on this browser");

  if (Notification.permission === "denied") {
    throw new Error("Notification permission is blocked at the OS level");
  }
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error(`Permission was ${perm}`);
  }

  // Evict any subscription left over from an old VAPID key — getToken() can't
  // resubscribe with a new applicationServerKey while an old one is active.
  await clearStaleSubscription();

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  // Wait for the SW to be active before getToken tries to use it.
  if (registration.installing || registration.waiting) {
    await new Promise<void>((resolve) => {
      const worker = registration.installing || registration.waiting;
      if (!worker) return resolve();
      if (worker.state === "activated") return resolve();
      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") resolve();
      });
    });
  }

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("FCM getToken returned empty");

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
  if (!messaging) throw new Error("Messaging not supported on this browser");
  try {
    await deleteToken(messaging);
  } catch {
    /* already gone, ignore */
  }
  // Nuke every SW registration + push subscription. Next getToken will start
  // from a clean slate — necessary when Firebase SDK's internal token cache
  // points at a subscription that no longer works.
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      try {
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      } catch {
        /* ignore */
      }
      try {
        await reg.unregister();
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
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
