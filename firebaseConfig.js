import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // ← NEW

const firebaseConfig = {
  apiKey: "AIzaSyAf-NY7T4tw3QD5jw1JsLB6HqOPwysR07Y",
  authDomain: "dawini-app-369.firebaseapp.com",
  projectId: "dawini-app-369",
  storageBucket: "dawini-app-369.firebasestorage.app",
  messagingSenderId: "226738120292",
  appId: "1:226738120292:web:4c26c2ea5d78537289a171",
  measurementId: "G-RDXGQXXCPV"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app); // ← NEW