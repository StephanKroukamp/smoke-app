import { useState } from "react";
import { arrayRemove, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useUserInfos } from "../lib/useUserInfos";

export function MemberList({
  memberUids,
  ownerUid,
  isOwner,
  groupId,
}: {
  memberUids: string[];
  ownerUid: string;
  isOwner: boolean;
  groupId: string;
}) {
  const members = useUserInfos(memberUids);
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(uid: string) {
    const m = members[uid];
    const label = m?.displayName || m?.email || "this member";
    if (!confirm(`Remove ${label} from the group?`)) return;
    setRemoving(uid);
    try {
      await updateDoc(doc(db, "groups", groupId), { memberUids: arrayRemove(uid) });
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="card">
      <h2>Members</h2>
      <div className="stack" style={{ gap: "0.5rem" }}>
        {memberUids.map((uid) => {
          const m = members[uid];
          const isThisOwner = uid === ownerUid;
          return (
            <div key={uid} className="row" style={{ justifyContent: "space-between" }}>
              <div className="row">
                {m?.photoURL ? (
                  <img
                    src={m.photoURL}
                    alt=""
                    width={32}
                    height={32}
                    style={{ borderRadius: "50%" }}
                  />
                ) : (
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: "var(--border)",
                    }}
                  />
                )}
                <div>
                  <div>
                    {m?.displayName || "Loading..."}
                    {isThisOwner && <span className="small dim"> · owner</span>}
                  </div>
                  <div className="small dim">{m?.email}</div>
                </div>
              </div>
              {isOwner && !isThisOwner && (
                <button
                  onClick={() => remove(uid)}
                  disabled={removing === uid}
                  className="small"
                  title="Remove member"
                  style={{ padding: "0.4rem 0.7rem" }}
                >
                  {removing === uid ? "…" : "✕"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
