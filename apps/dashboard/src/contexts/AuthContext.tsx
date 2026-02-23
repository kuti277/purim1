import {
  createContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { clientAuth, clientDb } from "../lib/firebase";
import type { User } from "@purim/types";

// ─── Context shape ────────────────────────────────────────────────────────────

export interface AuthContextValue {
  /**
   * The fully-hydrated @purim/types User from Firestore, or null when signed out.
   * Use user.role to gate UI elements (e.g. admin-only sections).
   */
  user: User | null;
  /**
   * True during the initial onAuthStateChanged resolution.
   * Render a loading spinner while this is true to avoid a flash of the login page.
   */
  loading: boolean;
  /** Sign in with email and password. Throws on failure — catch in the caller. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Sign out the current user. */
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      clientAuth,
      async (firebaseUser: FirebaseUser | null) => {
        if (firebaseUser) {
          try {
            // Cross-reference the Firebase Auth identity with the Firestore
            // User document to get role, workerId, and all typed fields.
            const snapshot = await getDoc(
              doc(clientDb, "users", firebaseUser.uid)
            );

            if (snapshot.exists()) {
              setUser(snapshot.data() as User);
            } else {
              // Auth account exists but no Firestore record — deny access.
              // This can happen if a user was created in Auth but the
              // Functions write failed, or the doc was manually deleted.
              console.warn(
                `[AuthContext] No Firestore document for uid ${firebaseUser.uid}. Signing out.`
              );
              await firebaseSignOut(clientAuth);
              setUser(null);
            }
          } catch (err) {
            console.error("[AuthContext] Failed to fetch user document:", err);
            setUser(null);
          }
        } else {
          setUser(null);
        }

        setLoading(false);
      }
    );

    // Unsubscribe the listener when the provider unmounts.
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string): Promise<void> => {
    // Delegate to Firebase — onAuthStateChanged will handle the state update.
    await signInWithEmailAndPassword(clientAuth, email, password);
  };

  const signOut = async (): Promise<void> => {
    await firebaseSignOut(clientAuth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
