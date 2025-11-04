const { initializeApp } = require('firebase/app');
const { getStorage } = require('firebase/storage');

// Firebase configuration using client-side SDK
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyC1IcTG7cskVhx_-M5ATY6G2dcaIkpBAtA",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "certusimages.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "certusimages",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "certusimages.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "954928629563",
  appId: process.env.FIREBASE_APP_ID || "1:954928629563:web:3ac73da09c7f9970f7191e",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-SML9W6B8FW"
};

let firebaseApp = null;
let storage = null;
let firebaseInitialized = false;

try {
  // Initialize Firebase
  firebaseApp = initializeApp(firebaseConfig);
  storage = getStorage(firebaseApp);
  firebaseInitialized = true;
  console.log('✅ Firebase initialized successfully');
  console.log(`📦 Storage bucket: ${firebaseConfig.storageBucket}`);
} catch (error) {
  console.error('❌ Failed to initialize Firebase:', error.message);
  firebaseInitialized = false;
}

module.exports = { 
  firebaseApp, 
  storage, 
  firebaseInitialized,
  firebaseConfig 
};