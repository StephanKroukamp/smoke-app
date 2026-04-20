import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  limit,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { RaiseFlagButton } from "../smokes/RaiseFlagButton";
import { ActiveSmoke, type Smoke } from "../smokes/ActiveSmoke";
import { TodaySessions } from "../smokes/TodaySessions";
import { InviteLinkCard } from "./InviteLinkCard";
import { MemberList } from "./MemberList";
import { OwnerActions } from "./OwnerActions";
import { LeaveGroupButton } from "./LeaveGroupButton";

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

async function tryCloseSmoke(smokeId: string) {
  try {
    await updateDoc(doc(db, "smokes", smokeId), { status: "closed" });
  } catch {
    /* noop */
  }
}

export function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState<DocumentData | null>(null);
  const [groupGone, setGroupGone] = useState(false);
  const [lastSmoke, setLastSmoke] = useState<Smoke | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!groupId) return;
    return onSnapshot(
      doc(db, "groups", groupId),
      (snap) => {
        if (!snap.exists()) {
          setGroupGone(true);
          setGroup(null);
        } else {
          setGroup(snap.data());
        }
      },
      () => setGroupGone(true)
    );
  }, [groupId]);

  useEffect(() => {
    if (!groupId) return;
    const q = query(
      collection(db, "smokes"),
      where("groupId", "==", groupId),
      orderBy("startedAt", "desc"),
      limit(1)
    );
    return onSnapshot(q, (snap) => {
      const d = snap.docs[0];
      setLastSmoke(d ? toSmoke(d.id, d.data()) : null);
    });
  }, [groupId]);

  const activeSmoke = useMemo(() => {
    if (!lastSmoke) return null;
    if (lastSmoke.status === "open" && lastSmoke.expiresAt > now) return lastSmoke;
    return null;
  }, [lastSmoke, now]);

  useEffect(() => {
    if (!lastSmoke) return;
    if (lastSmoke.status !== "open") return;
    if (lastSmoke.expiresAt > now) return;
    if (lastSmoke.initiatorUid === user?.uid) {
      tryCloseSmoke(lastSmoke.id);
    }
  }, [lastSmoke, now, user?.uid]);

  async function deleteGroup() {
    if (!groupId) return;
    await deleteDoc(doc(db, "groups", groupId));
    navigate("/", { replace: true });
  }

  if (!groupId || !user) return null;
  if (groupGone) {
    return (
      <div className="card stack" style={{ marginTop: "10vh", textAlign: "center" }}>
        <p>This group no longer exists or you no longer have access.</p>
        <Link to="/">← Back to groups</Link>
      </div>
    );
  }
  if (!group) return <p className="dim">Loading...</p>;

  const isOwner = group.ownerUid === user.uid;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>{group.name}</h1>
        <Link to="/" className="small">← Groups</Link>
      </div>

      {activeSmoke ? (
        <ActiveSmoke
          smoke={activeSmoke}
          currentUid={user.uid}
          memberUids={group.memberUids ?? []}
          isOwner={isOwner}
        />
      ) : (
        <RaiseFlagButton groupId={groupId} />
      )}

      <TodaySessions groupId={groupId} />

      <MemberList
        memberUids={group.memberUids ?? []}
        ownerUid={group.ownerUid}
        isOwner={isOwner}
        groupId={groupId}
      />

      {isOwner && <InviteLinkCard groupId={groupId} />}

      {isOwner ? (
        <OwnerActions
          groupId={groupId}
          currentName={group.name}
          onDelete={deleteGroup}
        />
      ) : (
        <LeaveGroupButton groupId={groupId} groupName={group.name} />
      )}
    </div>
  );
}
