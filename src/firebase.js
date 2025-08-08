import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from 'firebase/storage';


const firebaseConfig = {
  apiKey: "AIzaSyCaXYIlgxbc3GyAvKKOZ6HypnfJC562PXY",
  authDomain: "kart-force.firebaseapp.com",
  projectId: "kart-force",
  storageBucket: "kart-force.firebasestorage.app",
  messagingSenderId: "433765001476",
  appId: "1:433765001476:web:0e47b6518a07c5b55ec851"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);