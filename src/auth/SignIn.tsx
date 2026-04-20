import { signInWithPopup } from "firebase/auth";
import { useState } from "react";
import { auth, googleProvider } from "../firebase";

export function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <div className="signin-hero stack">
        <div className="brand-mark" aria-hidden="true" />
        <h1>Smoke Break</h1>
        <p className="tagline">Raise the flag. Rally the crew.</p>
        <button className="primary" onClick={onSignIn} disabled={busy}>
          {busy ? "Signing in..." : "Sign in with Google"}
        </button>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      </div>
    </div>
  );
}
