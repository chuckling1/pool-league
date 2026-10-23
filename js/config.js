// Paste the firebaseConfig from Firebase console > Project settings > Your apps.
// These values are not secrets; access is controlled by firestore.rules.
// While apiKey still starts with "PASTE", the site runs in demo mode
// (data is saved only in this browser).
export const firebaseConfig = {
  apiKey: "AIzaSyC4ywUyDvJbfCEiLCKoUPKSsrt4dm8m0oY",
  authDomain: "pool-league-ad9df.firebaseapp.com",
  projectId: "pool-league-ad9df",
  storageBucket: "pool-league-ad9df.firebasestorage.app",
  messagingSenderId: "103073152098",
  appId: "1:103073152098:web:fc808f7dc2d791fabd653b",
};

// Optional: a league code everyone lands in without typing anything.
// Leave empty ("") to have people enter a code the first time they visit.
export const defaultLeague = "";
