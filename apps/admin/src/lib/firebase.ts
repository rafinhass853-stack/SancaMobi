import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "sancamobi.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "sancamobi",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "sancamobi.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "124451108176",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:124451108176:web:cb28814a7beb7ffdff2855"
};

const app = getApps().length ? getApp() : initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "southamerica-east1");
