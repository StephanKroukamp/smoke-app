import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { countStoredTokens, registerPushForUser, resetPushForUser } from "./registerPush";
import { sendSelfTestPush } from "../smokes/callPushWorker";
import { isIos, useIsStandalone } from "../pwa/useIsStandalone";

type State =
  | "checking"
  | "unsupported"
  | "default" // never prompted or dismissed
  | "denied" // user actively blocked
  | "granted-no-token" // allowed but token save failed
  | "granted"; // fully working

export function NotificationGate() {
  const { user } = useAuth();
  const standalone = useIsStandalone();
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    if (typeof Notification === "undefined") {
      setState("unsupported");
      return;
    }
    const perm = Notification.permission;
    if (perm === "denied") setState("denied");
    else if (perm === "default") setState("default");
    else setState("granted-no-token");
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (state !== "granted-no-token") return;
    (async () => {
      try {
        const token = await registerPushForUser(user.uid);
        setState(token ? "granted" : "granted-no-token");
      } catch (e) {
        console.warn("Token register failed:", e);
        setState("granted-no-token");
      }
    })();
  }, [user, state]);

  useEffect(() => {
    if (!user || state !== "granted") return;
    countStoredTokens(user.uid).then(setTokenCount).catch(() => setTokenCount(null));
  }, [user, state]);

  async function enable() {
    if (!user || busy) return;
    setBusy(true);
    setTestStatus(null);
    try {
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm === "denied") {
        setState("denied");
        return;
      }
      if (perm !== "granted") {
        setState("default");
        return;
      }
      const token = await registerPushForUser(user.uid);
      setState(token ? "granted" : "granted-no-token");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!user || busy) return;
    setBusy(true);
    setTestStatus("Sending…");
    try {
      const result = await sendSelfTestPush();
      if (result.ok && result.sent > 0) {
        setTestStatus(
          `✅ Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}. If you don't see a notification within 5s, check your phone's system notifications settings for Chrome.`
        );
      } else if (result.tokenCount === 0) {
        setTestStatus(
          "⚠️ No tokens registered for this user. Try Reset below."
        );
      } else if (result.failed > 0) {
        setTestStatus(
          `❌ FCM rejected ${result.failed} token${result.failed === 1 ? "" : "s"} (of ${result.tokenCount}). Error: ${result.errors[0] ?? "(none)"} — tap Reset to regenerate.`
        );
      } else {
        setTestStatus(
          `❌ ${result.message ?? "Push failed"} · sent=${result.sent} failed=${result.failed} tokens=${result.tokenCount}`
        );
      }
    } catch (e) {
      setTestStatus(`❌ ${e instanceof Error ? e.message : "Test failed"}`);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!user || busy) return;
    if (!confirm("Reset notification registration on this device? You'll get a fresh push token.")) return;
    setBusy(true);
    setTestStatus("Resetting…");
    try {
      const token = await resetPushForUser(user.uid);
      if (token) {
        setState("granted");
        setTestStatus("✅ Reset complete — fresh token registered. Tap 'Send test' to verify.");
        const count = await countStoredTokens(user.uid);
        setTokenCount(count);
      } else {
        setTestStatus("❌ Could not register a new token. Check notification permission in Chrome settings.");
      }
    } catch (e) {
      setTestStatus(`❌ ${e instanceof Error ? e.message : "Reset failed"}`);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  if (state === "checking") return null;

  // iOS needs PWA install before it can even prompt for permission.
  if (isIos() && !standalone) {
    return (
      <div className="card" style={{ borderColor: "var(--accent)", background: "#2a1e10" }}>
        <h2 style={{ margin: 0 }}>⚠️ Install required for notifications</h2>
        <p className="small">
          On iPhone, you must add this app to your Home Screen to receive push notifications:
        </p>
        <ol className="small" style={{ paddingLeft: "1.2rem", margin: "0.5rem 0" }}>
          <li>Tap the <strong>Share</strong> icon at the bottom of Safari</li>
          <li>Tap <strong>Add to Home Screen</strong></li>
          <li>Open Smoke Break from the new icon and sign in again</li>
        </ol>
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div className="card" style={{ borderColor: "var(--danger)" }}>
        <h2 style={{ margin: 0 }}>This browser can't receive push notifications</h2>
        <p className="small">Use Chrome on Android, or any Chromium browser on desktop.</p>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="card" style={{ borderColor: "var(--danger)", background: "#2a1313" }}>
        <h2 style={{ margin: 0 }}>🔔 Notifications are blocked</h2>
        <p className="small">
          You won't be pinged for smokes until you re-allow notifications. On Android Chrome:
        </p>
        <ol className="small" style={{ paddingLeft: "1.2rem", margin: "0.5rem 0" }}>
          <li>Tap the <strong>⋮</strong> menu (top-right of Chrome)</li>
          <li>Tap <strong>Site settings</strong> (or the little lock icon → Permissions)</li>
          <li>Find <strong>Notifications</strong> → set to <strong>Allow</strong></li>
          <li>Come back and reload this page</li>
        </ol>
      </div>
    );
  }

  if (state === "default" || state === "granted-no-token") {
    return (
      <div
        className="card"
        style={{ borderColor: "var(--accent)", background: "#2a1e10", cursor: "pointer" }}
        onClick={enable}
        role="button"
      >
        <h2 style={{ margin: 0 }}>🔔 Enable push notifications</h2>
        <p className="small" style={{ margin: "0.5rem 0" }}>
          {state === "default"
            ? "Tap to allow notifications so you get pinged when someone raises the flag."
            : "Almost there — tap to finish enabling push notifications."}
        </p>
        <button className="primary" disabled={busy} onClick={enable}>
          {busy ? "Enabling..." : "Enable notifications"}
        </button>
      </div>
    );
  }

  // state === "granted" — show a muted debug strip so anyone struggling can self-test
  return (
    <div className="card" style={{ padding: "0.75rem 1rem" }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <div className="small">
          🔔 Push enabled
          {tokenCount != null && (
            <span className="dim"> · {tokenCount} device{tokenCount === 1 ? "" : "s"}</span>
          )}
        </div>
        <div className="row" style={{ gap: "0.4rem" }}>
          <button className="small" style={{ padding: "0.3rem 0.7rem" }} onClick={sendTest} disabled={busy}>
            Send test
          </button>
          <button className="small" style={{ padding: "0.3rem 0.7rem" }} onClick={reset} disabled={busy}>
            Reset
          </button>
        </div>
      </div>
      {testStatus && (
        <p className="small" style={{ margin: "0.5rem 0 0" }}>
          {testStatus}
        </p>
      )}
    </div>
  );
}
