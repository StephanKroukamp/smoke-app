import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";

export function CreateGroup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !user) return;
    setBusy(true);
    const ref = await addDoc(collection(db, "groups"), {
      name: name.trim(),
      ownerUid: user.uid,
      memberUids: [user.uid],
      createdAt: serverTimestamp(),
    });
    setBusy(false);
    navigate(`/groups/${ref.id}`);
  }

  return (
    <form onSubmit={onCreate} className="card stack">
      <h2>New group</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Group name (e.g. Smoke Crew)"
        maxLength={40}
      />
      <button className="primary" type="submit" disabled={busy || !name.trim()}>
        {busy ? "Creating..." : "Create group"}
      </button>
    </form>
  );
}
