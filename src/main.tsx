import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthProvider";
import "./index.css";

// One-time self-heal: any device with a stale Firebase Installations cache
// silently fails push registration ("missing authentication credential").
// Before Firebase initializes, wipe the messaging/installations IndexedDB so
// the SDK generates a fresh FID. Auth DB is untouched — users stay signed in.
// The flag ensures this runs once per device, not every load.
const HEAL_FLAG = "fb_install_reset_2026_04_22";
async function healFirebaseState() {
  if (typeof indexedDB === "undefined") return;
  if (localStorage.getItem(HEAL_FLAG) === "1") return;
  const names = [
    "firebase-installations-database",
    "firebase-messaging-database",
    "firebase-heartbeat-database",
  ];
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        })
    )
  );
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        try {
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe();
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  localStorage.setItem(HEAL_FLAG, "1");
}

healFirebaseState().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
});
