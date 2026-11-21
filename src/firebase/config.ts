import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAlyjSLDn4G9jpVbp2ItyYoXm8QdAg6ITM",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "astt-sondages-app.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "astt-sondages-app",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "astt-sondages-app.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "187011198550",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:187011198550:web:c1921b5859cb3395e515f7",
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
