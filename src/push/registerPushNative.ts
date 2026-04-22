import { PushNotifications } from "@capacitor/push-notifications";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Native push registration for Capacitor (Android APK). Uses the device's
 * native FCM SDK instead of the Web Push API — far more reliable than web
 * push in a WebView.
 *
 * The FCM token we get here is in the same format as the one from the web
 * SDK, so the Cloudflare Worker's existing send logic works unchanged.
 */
export async function registerPushNative(uid: string): Promise<string | null> {
  const permStatus = await PushNotifications.checkPermissions();
  let receive = permStatus.receive;
  if (receive === "prompt") {
    receive = (await PushNotifications.requestPermissions()).receive;
  }
  if (receive !== "granted") {
    throw new Error(`Native notification permission: ${receive}`);
  }

  const token = await new Promise<string>((resolve, reject) => {
    const successHandle = PushNotifications.addListener("registration", (t) => {
      successHandle.then((h) => h.remove());
      errorHandle.then((h) => h.remove());
      resolve(t.value);
    });
    const errorHandle = PushNotifications.addListener(
      "registrationError",
      (err) => {
        successHandle.then((h) => h.remove());
        errorHandle.then((h) => h.remove());
        reject(new Error(err.error ?? "Native registration error"));
      }
    );
    PushNotifications.register().catch(reject);
  });

  await setDoc(
    doc(db, "users", uid),
    {
      fcmTokens: {
        [token]: { platform: "android-native", createdAt: serverTimestamp() },
      },
    },
    { merge: true }
  );

  return token;
}
