import { useState } from "react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import { newInviteCode } from "../lib/inviteCodes";

export function InviteLinkCard({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  async function generate() {
    if (!user) return;
    const newCode = newInviteCode();
    const expiresAt = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await setDoc(doc(db, "groups", groupId, "invites", newCode), {
      createdBy: user.uid,
      createdAt: Timestamp.now(),
      expiresAt,
      maxUses: null,
      uses: 0,
    });
    setCode(newCode);
  }

  async function copy() {
    if (!code) return;
    const url = `https://smokesignal-c2668.web.app/join/${groupId}/${code}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const url = code ? `https://smokesignal-c2668.web.app/join/${groupId}/${code}` : null;

  return (
    <div className="card stack">
      <h2>Invite link</h2>
      {url ? (
        <>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <button className="primary" onClick={copy}>
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button onClick={generate}>Regenerate</button>
          </div>
          <p className="small dim">Expires in 7 days. Anyone with the link who signs in joins the group.</p>
        </>
      ) : (
        <button className="primary" onClick={generate}>
          Generate invite link
        </button>
      )}
    </div>
  );
}
