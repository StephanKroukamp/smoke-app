import { useEffect, useMemo, useState } from "react";
import { doc, serverTimestamp, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { notifyInitiatorResponse } from "./callPushWorker";
import { displayFor, useUserInfos } from "../lib/useUserInfos";

export type Smoke = {
  id: string;
  groupId: string;
  initiatorUid: string;
  startedAt: number;
  expiresAt: number;
  durationMinutes: number;
  status: "open" | "closed";
  responses: Record<string, { status: "accepted" | "denied"; respondedAt: unknown }>;
};

function formatMMSS(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function respondedAtMs(v: unknown): number | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toMillis();
  // Firestore SDK also returns objects with .toMillis()
  if (typeof v === "object" && v !== null && "toMillis" in v) {
    const fn = (v as { toMillis: () => number }).toMillis;
    if (typeof fn === "function") return fn.call(v);
  }
  return null;
}

type TimelineEvent =
  | { kind: "raised"; at: number; uid: string; durationMinutes: number }
  | { kind: "response"; at: number; uid: string; status: "accepted" | "denied" };

export function ActiveSmoke({
  smoke,
  currentUid,
  memberUids,
  isOwner = false,
  pastMode = false,
}: {
  smoke: Smoke;
  currentUid: string;
  memberUids: string[];
  /** True if the current user owns the group — enables cancel button even for non-initiators. */
  isOwner?: boolean;
  /** When true, renders as a read-only summary of a finished smoke (no countdown, no buttons). */
  pastMode?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const userInfos = useUserInfos(memberUids);

  const remaining = smoke.expiresAt - now;
  const elapsed = now - smoke.startedAt;
  const expired = remaining <= 0;
  const isInitiator = smoke.initiatorUid === currentUid;
  const myResponse = smoke.responses[currentUid]?.status;
  const initiatorName = displayFor(userInfos[smoke.initiatorUid], smoke.initiatorUid);

  const events: TimelineEvent[] = useMemo(() => {
    const list: TimelineEvent[] = [
      { kind: "raised", at: smoke.startedAt, uid: smoke.initiatorUid, durationMinutes: smoke.durationMinutes },
    ];
    for (const [uid, r] of Object.entries(smoke.responses)) {
      const at = respondedAtMs(r.respondedAt);
      if (at == null) continue;
      list.push({ kind: "response", at, uid, status: r.status });
    }
    return list.sort((a, b) => a.at - b.at);
  }, [smoke.startedAt, smoke.initiatorUid, smoke.durationMinutes, smoke.responses]);

  const awaiting = memberUids.filter(
    (uid) => uid !== smoke.initiatorUid && !smoke.responses[uid]
  );

  async function respond(status: "accepted" | "denied") {
    if (busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, "smokes", smoke.id), {
        [`responses.${currentUid}`]: { status, respondedAt: serverTimestamp() },
      });
      await notifyInitiatorResponse(smoke.id, status);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (cancelling) return;
    if (!confirm("Cancel this smoke session? Everyone in the group will see it ended.")) return;
    setCancelling(true);
    try {
      await updateDoc(doc(db, "smokes", smoke.id), { status: "closed" });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setCancelling(false);
    }
  }

  const canCancel = !pastMode && !expired && (isOwner || isInitiator);

  const headerTitle = pastMode ? "Last smoke" : "Smoke is on";
  const cardClass = !pastMode && !expired ? "card glow stack" : "card stack";

  return (
    <div className={cardClass}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div className="row" style={{ gap: "0.5rem" }}>
          <h2 style={{ margin: 0 }}>🚬 {headerTitle}</h2>
          {!pastMode && !expired && <span className="chip live">live</span>}
        </div>
        {!pastMode && (
          <div className={expired ? "countdown expired" : "countdown"}>
            {formatMMSS(remaining)}
          </div>
        )}
      </div>

      <div className="small dim">
        Raised by <strong style={{ color: "var(--fg)" }}>{initiatorName}</strong>
        {pastMode
          ? ` at ${formatClock(smoke.startedAt)} · ${smoke.durationMinutes} min session`
          : ` · ${formatMMSS(elapsed)} ago · ${smoke.durationMinutes} min window`}
      </div>

      {!pastMode && !expired && !isInitiator && !myResponse && (
        <div className="row">
          <button className="success" onClick={() => respond("accepted")} disabled={busy}>
            Accept
          </button>
          <button className="danger" onClick={() => respond("denied")} disabled={busy}>
            Deny
          </button>
        </div>
      )}

      {!pastMode && myResponse && (
        <p className="dim small" style={{ margin: 0 }}>
          You {myResponse === "accepted" ? "accepted" : "declined"}.
        </p>
      )}

      {!pastMode && expired && (
        <p className="dim small" style={{ margin: 0 }}>This smoke window has closed.</p>
      )}

      {canCancel && (
        <button
          onClick={cancel}
          disabled={cancelling}
          className="small"
          style={{ alignSelf: "flex-start" }}
        >
          {cancelling ? "Cancelling..." : isInitiator ? "Cancel session" : "Cancel (as owner)"}
        </button>
      )}

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 0.5rem" }}>Timeline</h2>
        <div className="stack" style={{ gap: "0.5rem" }}>
          {events.map((ev, i) => {
            const who = displayFor(userInfos[ev.uid], ev.uid);
            const time = formatClock(ev.at);
            if (ev.kind === "raised") {
              return (
                <TimelineRow key={i} dot="🚩" time={time} dotColor="var(--accent)">
                  <strong>{who}</strong> raised the flag
                  <span className="dim"> ({ev.durationMinutes} min)</span>
                </TimelineRow>
              );
            }
            const accepted = ev.status === "accepted";
            return (
              <TimelineRow
                key={i}
                dot={accepted ? "✅" : "❌"}
                time={time}
                dotColor={accepted ? "var(--success)" : "var(--danger)"}
              >
                <strong>{who}</strong>{" "}
                <span style={{ color: accepted ? "var(--success)" : "var(--danger)" }}>
                  {accepted ? "accepted" : "declined"}
                </span>
              </TimelineRow>
            );
          })}
          {awaiting.map((uid) => (
            <TimelineRow key={uid} dot="⏳" time="—" dotColor="var(--fg-dim)">
              <span className="dim">Waiting for </span>
              <strong>{displayFor(userInfos[uid], uid)}</strong>
            </TimelineRow>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  dot,
  dotColor,
  time,
  children,
}: {
  dot: string;
  dotColor: string;
  time: string;
  children: React.ReactNode;
}) {
  return (
    <div className="row" style={{ gap: "0.6rem", alignItems: "flex-start" }}>
      <div
        style={{
          minWidth: "1.5rem",
          textAlign: "center",
          color: dotColor,
          fontSize: "1rem",
          lineHeight: "1.2rem",
        }}
      >
        {dot}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "0.95rem" }}>{children}</div>
        <div className="small dim" style={{ fontVariantNumeric: "tabular-nums" }}>{time}</div>
      </div>
    </div>
  );
}
