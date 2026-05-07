import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || ""
};

const requiredConfigKeys = ["apiKey", "authDomain", "projectId", "appId"];

export const missingFirebaseConfigKeys = requiredConfigKeys.filter((key) => !firebaseConfig[key]);
export const hasFirebaseConfig = missingFirebaseConfigKeys.length === 0;

let firebaseApp;
let firebaseAuth;
let googleProvider;

export function getFirebaseApp() {
  if (!hasFirebaseConfig) {
    throw new Error(`Firebase Auth is missing: ${missingFirebaseConfigKeys.join(", ")}.`);
  }

  if (!firebaseApp) {
    firebaseApp = getApps()[0] || initializeApp(firebaseConfig);
  }

  return firebaseApp;
}

export function getFirebaseAuth() {
  if (!firebaseAuth) firebaseAuth = getAuth(getFirebaseApp());
  return firebaseAuth;
}

export function getGoogleProvider() {
  if (!googleProvider) {
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: "select_account" });
  }
  return googleProvider;
}
