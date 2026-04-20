import { useCallback, useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useAuth } from "./auth/AuthProvider";
import { SignIn } from "./auth/SignIn";
import { GroupList } from "./groups/GroupList";
import { CreateGroup } from "./groups/CreateGroup";
import { GroupDetail } from "./groups/GroupDetail";
import { JoinGroup } from "./groups/JoinGroup";
import { SmokeDetail } from "./smokes/SmokeDetail";
import { IosInstallPrompt } from "./pwa/IosInstallPrompt";
import { NotificationGate } from "./push/NotificationGate";
import { useForegroundMessages } from "./push/useForegroundMessages";
import { canCreateGroups } from "./lib/permissions";

function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useForegroundMessages(
    useCallback((title, body, data) => {
      const smokeId = data.smokeId;
      if (smokeId) {
        navigate(`/smoke/${smokeId}`);
      } else {
        alert(`${title}\n${body}`);
      }
    }, [navigate])
  );

  if (!user) return null;

  return (
    <div className="stack">
      <div className="app-header">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <div>
            <div className="brand-name">Smoke Break</div>
            <div className="brand-sub">Raise the flag. Rally the crew.</div>
          </div>
        </div>
        <button className="small ghost" onClick={() => signOut(auth)}>
          Sign out
        </button>
      </div>
      <NotificationGate />
      <IosInstallPrompt />
      {canCreateGroups(user.email) && <CreateGroup />}
      <GroupList />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="dim app">Loading...</p>;
  if (!user) return <SignIn />;
  return <>{children}</>;
}

function PendingJoinRedirect() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!user) return;
    const pending = sessionStorage.getItem("pendingJoin");
    if (pending) {
      sessionStorage.removeItem("pendingJoin");
      navigate(`/join/${pending}`, { replace: true });
    }
  }, [user, navigate]);
  return null;
}

export default function App() {
  return (
    <div className="app">
      <PendingJoinRedirect />
      <Routes>
        <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
        <Route path="/groups/:groupId" element={<RequireAuth><GroupDetail /></RequireAuth>} />
        <Route path="/smoke/:smokeId" element={<RequireAuth><SmokeDetail /></RequireAuth>} />
        <Route path="/join/:groupId/:code" element={<RequireAuth><JoinGroup /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
