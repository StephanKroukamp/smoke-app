import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { displayFor, useUserInfos } from "../lib/useUserInfos";

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

type Session = {
  id: string;
  startedAt: number;
  expiresAt: number;
  initiatorUid: string;
  status: "open" | "closed";
  accepted: number;
  denied: number;
};

export function TodaySessions({ groupId }: { groupId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const startMs = startOfToday();
    const q = query(
      collection(db, "smokes"),
      where("groupId", "==", groupId),
      where("startedAt", ">=", Timestamp.fromMillis(startMs)),
      orderBy("startedAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      const items: Session[] = snap.docs.map((d) => {
        const data = d.data();
        const responses = (data.responses ?? {}) as Record<string, { status: string }>;
        const values = Object.values(responses);
        return {
          id: d.id,
          startedAt: data.startedAt?.toMillis?.() ?? 0,
          expiresAt: data.expiresAt?.toMillis?.() ?? 0,
          initiatorUid: data.initiatorUid,
          status: data.status,
          accepted: values.filter((r) => r.status === "accepted").length,
          denied: values.filter((r) => r.status === "denied").length,
        };
      });
      setSessions(items);
    });
  }, [groupId]);

  const uids = useMemo(() => Array.from(new Set(sessions.map((s) => s.initiatorUid))), [sessions]);
  const users = useUserInfos(uids);

  const count = sessions.length;

  if (count === 0) {
    return (
      <div className="card" style={{ padding: "0.75rem 1rem" }}>
        <div className="small dim">📅 No sessions yet today</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: "0.75rem 1rem" }}>
      <div
        className="row"
        style={{ justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setExpanded((e) => !e)}
        role="button"
      >
        <div>
          📅 <strong>{count}</strong>{" "}
          {count === 1 ? "session" : "sessions"} today
        </div>
        <div className="small dim">{expanded ? "▲ hide" : "▼ show"}</div>
      </div>

      {expanded && (
        <div className="stack" style={{ marginTop: "0.75rem", gap: "0.4rem" }}>
          {sessions.map((s) => {
            const who = displayFor(users[s.initiatorUid], s.initiatorUid);
            const time = new Date(s.startedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const isActive = s.status === "open" && s.expiresAt > now;
            return (
              <div
                key={s.id}
                className="small"
                style={{
                  fontVariantNumeric: "tabular-nums",
                  display: "flex",
                  gap: "0.6rem",
                  alignItems: "baseline",
                }}
              >
                <span className="dim" style={{ minWidth: "3rem" }}>{time}</span>
                <div style={{ flex: 1 }}>
                  <strong>{who}</strong>
                  {(s.accepted > 0 || s.denied > 0) && <span className="dim"> · </span>}
                  {s.accepted > 0 && (
                    <span style={{ color: "var(--success)" }}>
                      {s.accepted} ✅
                    </span>
                  )}
                  {s.accepted > 0 && s.denied > 0 && <span className="dim">, </span>}
                  {s.denied > 0 && (
                    <span style={{ color: "var(--danger)" }}>
                      {s.denied} ❌
                    </span>
                  )}
                  {isActive && (
                    <span style={{ color: "var(--accent)" }}> · active</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
