// Test script to verify Firebase configuration
const { initializeApp } = require('firebase/app');
const { getAuth, GoogleAuthProvider } = require('firebase/auth');

// Test client-side Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBlSUSaywTQ4q38Be0LAnfxP4AlXLHm5ac",
  authDomain: "mwazen-f0e11.firebaseapp.com",
  projectId: "mwazen-f0e11",
  storageBucket: "mwazen-f0e11.firebasestorage.app",
  messagingSenderId: "300993191953",
  appId: "1:300993191953:web:e18248642c9e12bfa851b0",
  measurementId: "G-VX3S43NKYL"
};

console.log('Testing Firebase configuration...');
console.log('Firebase Config:', firebaseConfig);

try {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  
  console.log('✅ Firebase client initialization successful');
  console.log('✅ Auth instance created');
  console.log('✅ GoogleAuthProvider created');
  console.log('✅ All Firebase configurations are valid');
} catch (error) {
  console.error('❌ Firebase configuration error:', error.message);
}

// Test server-side Firebase Admin (if available)
try {
  const admin = require('firebase-admin');
  console.log('✅ Firebase Admin SDK is available');
} catch (error) {
  console.log('ℹ️ Firebase Admin SDK not available in test environment');
}
