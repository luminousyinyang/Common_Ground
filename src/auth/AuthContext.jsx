import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { getFirebaseAuth, hasFirebaseConfig, missingFirebaseConfigKeys } from "../lib/firebase.js";
import { clearPendingSignupProfile, logoutFirebaseUser, readPendingSignupProfile } from "../lib/authClient.js";

const AuthContext = createContext(null);

function serializeUser(user) {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || "",
    name: user.displayName || user.email || "Common Ground fan",
    firstName: user.displayName?.trim().split(/\s+/)[0] || "",
    lastName: user.displayName?.trim().split(/\s+/).slice(1).join(" ") || "",
    photoURL: user.photoURL || "",
    emailVerified: user.emailVerified
  };
}

async function createServerSession(firebaseUser) {
  const idToken = await firebaseUser.getIdToken();
  const pendingProfile = readPendingSignupProfile();
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      idToken,
      profile: pendingProfile || undefined
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not create a server session.");
  clearPendingSignupProfile();
  return payload.user;
}

async function clearServerSession() {
  await fetch("/api/auth/session", {
    method: "DELETE",
    headers: { Accept: "application/json" }
  }).catch(() => {});
}

function configErrorMessage() {
  return `Firebase Auth is not configured yet. Add ${missingFirebaseConfigKeys.map((key) => `VITE_FIREBASE_${key.replace(/[A-Z]/g, (match) => `_${match}`).toUpperCase()}`).join(", ")} to .env.`;
}

function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [sessionUser, setSessionUser] = useState(null);
  const [loading, setLoading] = useState(hasFirebaseConfig);
  const [authError, setAuthError] = useState(hasFirebaseConfig ? "" : configErrorMessage());
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    if (!hasFirebaseConfig) return undefined;

    let mounted = true;
    let auth;

    try {
      auth = getFirebaseAuth();
    } catch (error) {
      setAuthError(error.message);
      setLoading(false);
      return undefined;
    }

    const unsubscribe = onIdTokenChanged(
      auth,
      async (nextUser) => {
        if (!mounted) return;
        setLoading(true);

        if (!nextUser) {
          setFirebaseUser(null);
          setSessionUser(null);
          setSessionError("");
          clearPendingSignupProfile();
          await clearServerSession();
          if (mounted) setLoading(false);
          return;
        }

        try {
          const serverUser = await createServerSession(nextUser);
          if (!mounted) return;
          setFirebaseUser(nextUser);
          setSessionUser(serverUser || serializeUser(nextUser));
          setSessionError("");
        } catch (error) {
          if (!mounted) return;
          setFirebaseUser(nextUser);
          setSessionUser(serializeUser(nextUser));
          setSessionError(error.message);
        } finally {
          if (mounted) setLoading(false);
        }
      },
      (error) => {
        if (!mounted) return;
        setAuthError(error.message);
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function logout() {
    clearPendingSignupProfile();
    await clearServerSession();
    await logoutFirebaseUser();
  }

  const value = useMemo(() => {
    const user = sessionUser || serializeUser(firebaseUser);
    return {
      authConfigured: hasFirebaseConfig,
      authError,
      firebaseUser,
      isLoggedIn: Boolean(firebaseUser),
      loading,
      logout,
      sessionError,
      user
    };
  }, [authError, firebaseUser, loading, sessionError, sessionUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

export default AuthProvider;
