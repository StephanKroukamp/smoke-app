import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export type UserInfo = { displayName: string; email: string; photoURL: string };

/**
 * Subscribes to user docs for each uid. Returns a map { uid → UserInfo }.
 * Members that haven't loaded yet simply won't appear in the map.
 */
export function useUserInfos(uids: string[]): Record<string, UserInfo> {
  const [infos, setInfos] = useState<Record<string, UserInfo>>({});
  const key = uids.slice().sort().join(",");

  useEffect(() => {
    if (uids.length === 0) return;
    const unsubs = uids.map((uid) =>
      onSnapshot(doc(db, "users", uid), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setInfos((prev) => ({
          ...prev,
          [uid]: {
            displayName: data.displayName ?? "",
            email: data.email ?? "",
            photoURL: data.photoURL ?? "",
          },
        }));
      })
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return infos;
}

export function displayFor(info: UserInfo | undefined, uid: string): string {
  if (!info) return uid.slice(0, 6) + "…";
  return info.displayName || info.email || uid.slice(0, 6) + "…";
}
