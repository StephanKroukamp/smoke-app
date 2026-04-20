import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, onSnapshot, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { ActiveSmoke, type Smoke } from "./ActiveSmoke";

function toSmoke(id: string, data: DocumentData): Smoke {
  return {
    id,
    groupId: data.groupId,
    initiatorUid: data.initiatorUid,
    startedAt: data.startedAt?.toMillis?.() ?? Date.now(),
    expiresAt: data.expiresAt?.toMillis?.() ?? Date.now(),
    durationMinutes: data.durationMinutes,
    status: data.status,
    responses: data.responses ?? {},
  };
}

export function SmokeDetail() {
  const { smokeId } = useParams<{ smokeId: string }>();
  const { user } = useAuth();
  const [smoke, setSmoke] = useState<Smoke | null>(null);
  const [memberUids, setMemberUids] = useState<string[] | null>(null);

  useEffect(() => {
    if (!smokeId) return;
    return onSnapshot(doc(db, "smokes", smokeId), (snap) => {
      if (!snap.exists()) return;
      setSmoke(toSmoke(snap.id, snap.data()));
    });
  }, [smokeId]);

  useEffect(() => {
    if (!smoke?.groupId) return;
    return onSnapshot(doc(db, "groups", smoke.groupId), (snap) => {
      setMemberUids(snap.exists() ? (snap.data().memberUids ?? []) : []);
    });
  }, [smoke?.groupId]);

  if (!user || !smoke || !memberUids) return <p className="dim">Loading...</p>;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Smoke</h1>
        <Link to={`/groups/${smoke.groupId}`} className="small">← Group</Link>
      </div>
      <ActiveSmoke smoke={smoke} currentUid={user.uid} memberUids={memberUids} />
    </div>
  );
}
