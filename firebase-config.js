
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDO0Ag9KeJi9FGJg6Oiiqq1EIdesrYB52Q",
    authDomain: "alerto-pnp.firebaseapp.com",
    projectId: "alerto-pnp",
    storageBucket: "alerto-pnp.firebasestorage.app",
    messagingSenderId: "432979180851",
    appId: "1:432979180851:web:52f5d33410aba6c2095246",
    measurementId: "G-1QK089R8L5"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
