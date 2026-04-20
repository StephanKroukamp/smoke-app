import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";

export function OwnerActions({
  groupId,
  currentName,
  onDelete,
}: {
  groupId: string;
  currentName: string;
  onDelete: () => void | Promise<void>;
}) {
  const [name, setName] = useState(currentName);
  const [editingName, setEditingName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await updateDoc(doc(db, "groups", groupId), { name: name.trim() });
      setEditingName(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!confirm("Delete this group permanently? This cannot be undone.")) return;
    setBusy(true);
    try {
      await onDelete();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <h2>Group settings</h2>

      {editingName ? (
        <form onSubmit={saveName} className="stack">
          <label className="small dim">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
          <div className="row">
            <button className="primary" type="submit" disabled={busy || !name.trim()}>
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingName(false);
                setName(currentName);
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div className="small dim">Name</div>
            <div>{currentName}</div>
          </div>
          <button onClick={() => setEditingName(true)}>Rename</button>
        </div>
      )}

      <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

      <button className="danger" onClick={doDelete} disabled={busy}>
        Delete group
      </button>

      {err && <p className="small" style={{ color: "var(--danger)" }}>{err}</p>}
    </div>
  );
}
