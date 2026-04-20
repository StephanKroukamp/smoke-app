import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useGroups } from "./useGroups";

export function GroupList() {
  const { user } = useAuth();
  const { groups, loading } = useGroups(user?.uid ?? null);

  if (loading) return <p className="dim">Loading groups...</p>;

  return (
    <div className="stack">
      {groups.length === 0 && (
        <p className="dim">No groups yet. Create one or join via an invite link.</p>
      )}
      {groups.map((g) => (
        <Link key={g.id} to={`/groups/${g.id}`} className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>{g.name}</h2>
            <span className="chip">
              {g.memberUids.length} {g.memberUids.length === 1 ? "member" : "members"}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
