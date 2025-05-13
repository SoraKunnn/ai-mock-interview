
import { initializeApp ,getApp ,getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAwVDz1T9C0apu1bqtDgY9ASP4tChVIq6k",
    authDomain: "prepwise-1db4f.firebaseapp.com",
    projectId: "prepwise-1db4f",
    storageBucket: "prepwise-1db4f.firebasestorage.app",
    messagingSenderId: "623246654606",
    appId: "1:623246654606:web:226d9546056a803dd95ddf",
    measurementId: "G-R3JLKHKVP3"
};

// Initialize Firebase
const app = !getApps.length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);