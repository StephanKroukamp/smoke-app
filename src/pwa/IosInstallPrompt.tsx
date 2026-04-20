import { useState } from "react";
import { isIos, useIsStandalone } from "./useIsStandalone";

const DISMISS_KEY = "ios-install-dismissed-at";
const DISMISS_FOR_DAYS = 7;

function recentlyDismissed(): boolean {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < DISMISS_FOR_DAYS * 24 * 60 * 60 * 1000;
}

export function IosInstallPrompt() {
  const standalone = useIsStandalone();
  const [dismissed, setDismissed] = useState(recentlyDismissed);

  if (standalone || !isIos() || dismissed) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setDismissed(true);
  }

  return (
    <div className="card" style={{ borderColor: "var(--accent)" }}>
      <h2>📱 Install on iPhone</h2>
      <p className="small">
        iOS needs the app on your Home Screen to send push notifications:
      </p>
      <ol className="small" style={{ paddingLeft: "1.2rem", margin: "0.5rem 0" }}>
        <li>
          Tap the <strong>Share</strong> icon at the bottom of Safari.
        </li>
        <li>
          Choose <strong>Add to Home Screen</strong>.
        </li>
        <li>Open Smoke Break from the new icon and sign in.</li>
      </ol>
      <button onClick={dismiss} className="small">
        Got it
      </button>
    </div>
  );
}
