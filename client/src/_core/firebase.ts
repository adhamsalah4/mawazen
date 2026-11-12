// Firebase client configuration
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Direct Firebase configuration
const resolvedAuthDomain =
  typeof window !== "undefined" &&
  (window.location.hostname === "mawazenco.com" ||
    window.location.hostname === "www.mawazenco.com" ||
    window.location.hostname.endsWith(".mawazenco.com"))
    ? "auth.mawazenco.com"
    : "mawzenco.firebaseapp.com";

const firebaseConfig = {
  apiKey: "AIzaSyCz-2b9eSERm7yxOU57cjPmFMgyNAw0Lyg",
  authDomain: "mwazeen-8aaa8.firebaseapp.com",
  projectId: "mwazeen-8aaa8",
  storageBucket: "mwazeen-8aaa8.firebasestorage.app",
  messagingSenderId: "781611084807",
  appId: "1:781611084807:web:48c273bacccb243c740ea2",
  measurementId: "G-QK5MBHNVTP"
};

let app: any = null;
let auth: any = null;

export async function getFirebaseApp() {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

export async function getFirebaseAuth() {
  if (!auth) {
    const firebaseApp = await getFirebaseApp();
    auth = getAuth(firebaseApp);
  }
  return auth;
}

export default app;