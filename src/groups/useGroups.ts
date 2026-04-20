import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../firebase";

export type Group = {
  id: string;
  name: string;
  ownerUid: string;
  memberUids: string[];
};

function toGroup(id: string, data: DocumentData): Group {
  return {
    id,
    name: data.name,
    ownerUid: data.ownerUid,
    memberUids: data.memberUids ?? [],
  };
}

export function useGroups(uid: string | null) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setGroups([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, "groups"), where("memberUids", "array-contains", uid));
    return onSnapshot(q, (snap) => {
      setGroups(snap.docs.map((d) => toGroup(d.id, d.data())));
      setLoading(false);
    });
  }, [uid]);

  return { groups, loading };
}
