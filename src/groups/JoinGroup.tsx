import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  doc,
  getDoc,
  increment,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";

export function JoinGroup() {
  const { groupId, code } = useParams<{ groupId: string; code: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "error" | "joined">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      sessionStorage.setItem("pendingJoin", `${groupId}/${code}`);
      navigate("/", { replace: true });
      return;
    }
    if (!groupId || !code) return;

    (async () => {
      try {
        const inviteRef = doc(db, "groups", groupId, "invites", code);
        const groupRef = doc(db, "groups", groupId);

        const inviteSnap = await getDoc(inviteRef);
        if (!inviteSnap.exists()) throw new Error("Invite not found");
        const invite = inviteSnap.data();
        if (invite.expiresAt && (invite.expiresAt as Timestamp).toMillis() < Date.now()) {
          throw new Error("Invite has expired");
        }
        if (invite.maxUses != null && invite.uses >= invite.maxUses) {
          throw new Error("Invite has been used up");
        }

        await runTransaction(db, async (tx) => {
          const groupSnap = await tx.get(groupRef);
          if (!groupSnap.exists()) throw new Error("Group no longer exists");
          const members: string[] = groupSnap.data().memberUids ?? [];
          if (!members.includes(user.uid)) {
            tx.update(groupRef, { memberUids: [...members, user.uid] });
          }
          tx.update(inviteRef, { uses: increment(1) });
        });

        setStatus("joined");
        setTimeout(() => navigate(`/groups/${groupId}`, { replace: true }), 600);
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Could not join group");
      }
    })();
  }, [user, loading, groupId, code, navigate]);

  return (
    <div className="card stack" style={{ marginTop: "10vh", textAlign: "center" }}>
      {status === "loading" && <p className="dim">Joining group...</p>}
      {status === "joined" && <p>Joined! Taking you in...</p>}
      {status === "error" && <p style={{ color: "var(--danger)" }}>{message}</p>}
    </div>
  );
}
