import { useState } from "react";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { notifyGroupSmoke } from "./callPushWorker";

export function RaiseFlagButton({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  async function raise(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Number(minutes);
    if (!Number.isFinite(n) || n < 1 || n > 120) {
      setError("Duration must be between 1 and 120 minutes.");
      return;
    }
    if (!user) return;

    setBusy(true);
    try {
      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(now.toMillis() + n * 60_000);
      const ref = await addDoc(collection(db, "smokes"), {
        groupId,
        initiatorUid: user.uid,
        startedAt: now,
        expiresAt,
        durationMinutes: Math.floor(n),
        status: "open",
        responses: {},
      });
      await notifyGroupSmoke(ref.id);
      setOpen(false);
      setMinutes("5");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not raise flag");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="hero" onClick={() => setOpen(true)}>
        🚩 Raise the flag
      </button>
    );
  }

  return (
    <form className="card stack" onSubmit={raise}>
      <h2 style={{ margin: 0 }}>How long does everyone have to respond?</h2>
      <label className="small dim">Minutes (1–120)</label>
      <input
        type="number"
        min={1}
        max={120}
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        autoFocus
      />
      {error && <p style={{ color: "var(--danger)" }} className="small">{error}</p>}
      <div className="row">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Raising..." : "Raise flag"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
