import { useEffect } from "react";
import { onMessage } from "firebase/messaging";
import { getMessagingIfSupported } from "../firebase";

export function useForegroundMessages(
  handler: (title: string, body: string, data: Record<string, string>) => void
) {
  useEffect(() => {
    let unsub: (() => void) | undefined;
    getMessagingIfSupported().then((messaging) => {
      if (!messaging) return;
      unsub = onMessage(messaging, (payload) => {
        const data = (payload.data as Record<string, string>) ?? {};
        const title = data.title ?? payload.notification?.title ?? "Smoke Break";
        const body = data.body ?? payload.notification?.body ?? "";
        handler(title, body, data);
      });
    });
    return () => unsub?.();
  }, [handler]);
}
