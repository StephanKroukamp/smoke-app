import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { arrayRemove, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";

export function LeaveGroupButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function leave() {
    if (!user) return;
    if (!confirm(`Leave "${groupName}"? You'll stop receiving smoke pings from this group.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await updateDoc(doc(db, "groups", groupId), { memberUids: arrayRemove(user.uid) });
      navigate("/", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not leave group");
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <h2>Leave group</h2>
      <p className="small dim" style={{ margin: 0 }}>
        You won't get pings from this group anymore. You can rejoin later via an invite link.
      </p>
      <button className="danger" onClick={leave} disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Leaving..." : "Leave group"}
      </button>
      {err && <p className="small" style={{ color: "var(--danger)" }}>{err}</p>}
    </div>
  );
}
