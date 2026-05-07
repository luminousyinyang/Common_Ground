import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile
} from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider } from "./firebase.js";

const PENDING_SIGNUP_PROFILE_KEY = "common-ground-pending-signup-profile";

function fullName({ firstName = "", lastName = "" }) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

export function readPendingSignupProfile() {
  try {
    const raw = window.sessionStorage.getItem(PENDING_SIGNUP_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPendingSignupProfile() {
  try {
    window.sessionStorage.removeItem(PENDING_SIGNUP_PROFILE_KEY);
  } catch {}
}

function writePendingSignupProfile(profile) {
  try {
    window.sessionStorage.setItem(PENDING_SIGNUP_PROFILE_KEY, JSON.stringify(profile));
  } catch {}
}

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
}

export async function signupWithEmail({ email, password, firstName, lastName }) {
  const profile = {
    firstName: firstName.trim(),
    lastName: lastName.trim()
  };
  writePendingSignupProfile(profile);

  try {
    const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    const displayName = fullName(profile);
    if (displayName) {
      await updateProfile(credential.user, { displayName });
      await credential.user.getIdToken(true);
    }
    return credential;
  } catch (error) {
    clearPendingSignupProfile();
    throw error;
  }
}

export async function loginWithGoogle() {
  return signInWithPopup(getFirebaseAuth(), getGoogleProvider());
}

export async function sendLoginReset(email) {
  return sendPasswordResetEmail(getFirebaseAuth(), email.trim());
}

export async function logoutFirebaseUser() {
  return signOut(getFirebaseAuth());
}

export function authErrorMessage(error) {
  const code = error?.code || "";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/missing-password") return "Enter your password.";
  if (code === "auth/weak-password") return "Use a password with at least 6 characters.";
  if (code === "auth/email-already-in-use") return "That email already has an account. Try logging in instead.";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "That email and password do not match an account.";
  }
  if (code === "auth/popup-closed-by-user") return "Google sign-in was closed before it finished.";
  if (code === "auth/popup-blocked") return "The browser blocked the Google sign-in popup.";
  if (code === "auth/unauthorized-domain") return "This domain is not authorized in Firebase Authentication.";
  if (code === "auth/network-request-failed") return "Network trouble reached Firebase. Try again in a moment.";
  return error?.message || "Authentication failed. Try again.";
}
