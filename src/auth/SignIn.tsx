import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
} from "firebase/auth";
import { useState } from "react";
import { auth, googleProvider } from "../firebase";

export function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignIn() {
    setBusy(true);
    setError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        // Native Google Sign-In via Play Services. Popups/redirects don't
        // work inside a Capacitor WebView — that's the "missing initial
        // state" error you see if you try signInWithPopup in the APK.
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential?.idToken;
        if (!idToken) throw new Error("Google did not return an ID token");
        await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
      } else {
        await signInWithPopup(auth, googleProvider);
      }
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
