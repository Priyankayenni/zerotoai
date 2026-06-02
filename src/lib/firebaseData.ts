import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { auth, firestore, isFirebaseConfigured } from "./firebaseClient";

import { phases } from "../data/roadmap";

export type Profile = { id: string; name: string; class: string | null };
export type Leader = { id: string; name: string; class: string | null; completed: number };

const PROFILES_COL = "profiles";
const PROGRESS_COL = "progress"; // /progress/{uid}/phases/{phaseId}
const SUMMARY_COL = "progress_summary"; // /progress_summary/{uid}

export function ensureFirebase() {
  if (!isFirebaseConfigured || !auth || !firestore) {
    throw new Error("Firebase is not configured.");
  }
}

export function currentUserId(): string | null {
  return auth?.currentUser?.uid ?? null;
}

export async function authSignUp(params: {
  email: string;
  password: string;
  name: string;
  className: string;
}) {
  ensureFirebase();
  const { email, password, name, className } = params;
  const { user } = await createUserWithEmailAndPassword(auth!, email, password);
  // Firebase Auth may require email verification; profile write should still be fine.
  await upsertProfile({ id: user.uid, name, class: className || null }, user);
  return user;
}


export async function authSignIn(params: { email: string; password: string }) {
  ensureFirebase();
  const { email, password } = params;
  await signInWithEmailAndPassword(auth!, email, password);
}

export async function authSignOut() {
  ensureFirebase();
  await signOut(auth!);
}

export async function upsertProfile(profile: Profile, user?: User | null) {
  ensureFirebase();
  if (!user && auth) user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");

  const ref = doc(firestore!, PROFILES_COL, user.uid);
  await setDoc(ref, {
    id: user.uid,
    name: profile.name,
    class: profile.class,
    updatedAt: serverTimestamp(),
  });
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  ensureFirebase();
  const ref = doc(firestore!, PROFILES_COL, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data() as any;
  return {
    id: d.id ?? userId,
    name: String(d.name ?? "Learner"),
    class: d.class ?? null,
  };
}

export async function loadCompletedPhaseIds(userId: string): Promise<Set<string>> {
  ensureFirebase();

  // Read only the completed ones.
  const phasesRef = collection(firestore!, PROGRESS_COL, userId, "phases");
  const q = query(phasesRef, where("completed", "==", true));
  const snaps = await getDocs(q);

  const out = new Set<string>();
  snaps.forEach(s => {
    // phaseId is the doc id
    out.add(s.id);
  });
  return out;
}

export async function togglePhaseDone(params: {
  userId: string;
  phaseId: string;
  adding: boolean;
}) {
  ensureFirebase();
  const { userId, phaseId, adding } = params;

  const phaseDoc = doc(firestore!, PROGRESS_COL, userId, "phases", phaseId);
  const summaryDoc = doc(firestore!, SUMMARY_COL, userId);

  await runTransaction(firestore!, async tx => {
    const phaseSnap = await tx.get(phaseDoc);
    const summarySnap = await tx.get(summaryDoc);

    const prevCompleted = phaseSnap.exists() ? Boolean((phaseSnap.data() as any).completed) : false;
    const currentlyHas = prevCompleted;

    // If adding but already has, no-op.
    if (adding && currentlyHas) return;
    // If removing but already missing, no-op.
    if (!adding && !currentlyHas) return;

    tx.set(phaseDoc, {
      completed: adding,
      updatedAt: serverTimestamp(),
    });

    const prevCount = summarySnap.exists() ? Number((summarySnap.data() as any).completedCount ?? 0) : 0;
    const nextCount = adding ? prevCount + 1 : prevCount - 1;

    tx.set(
      summaryDoc,
      {
        completedCount: Math.max(0, nextCount),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export async function loadLeaderboard(params: { limit: number }): Promise<Array<{ id: string; name: string; completed: number }>> {
  ensureFirebase();
  const { limit } = params;

  // Load summaries, sorted by completedCount.
  // Note: Firestore requires `limit()` but we avoid importing it by slicing client-side.
  const q = query(collection(firestore!, SUMMARY_COL), orderBy("completedCount", "desc"));
  const snaps = await getDocs(q);

  const all = snaps.docs
    .map(d => ({ id: d.id, completed: Number((d.data() as any).completedCount ?? 0) }))
    .sort((a, b) => b.completed - a.completed)
    .slice(0, limit);

  // Fetch names for those users.
  const profilesSnaps = await Promise.all(
    all.map(x => getDoc(doc(firestore!, PROFILES_COL, x.id)))
  );

  return all.map((u, i) => {
    const ps = profilesSnaps[i];
    const pd = ps.exists() ? (ps.data() as any) : null;
    return {
      id: u.id,
      name: String(pd?.name ?? "Learner"),
      completed: u.completed,
    };
  });
}


export async function computeLocalOrFirebaseProgress(params: {
  userId: string | null;
}) {
  const { userId } = params;
  if (!userId || !isFirebaseConfigured) return new Set<string>();
  return loadCompletedPhaseIds(userId);
}

export const TOTAL_PHASES = phases.length;

