import { initializeApp, getApps, getApp } from "firebase/app"
import { getAuth, Auth } from "firebase/auth"
import { getStorage, FirebaseStorage } from "firebase/storage"
import { getFirestore, Firestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-project",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "demo.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abcdef",
}

// Initialize Firebase only if it hasn't been initialized yet
let app
let auth: Auth
let storage: FirebaseStorage
let db: Firestore

try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()
  auth = getAuth(app)
  storage = getStorage(app)
  db = getFirestore(app)
} catch (error) {
  // If initialization fails, create a dummy app for build time
  console.warn("Firebase initialization failed:", error)
  app = getApps()[0] || null
  auth = app ? getAuth(app) : {} as Auth
  storage = app ? getStorage(app) : {} as FirebaseStorage
  db = app ? getFirestore(app) : {} as Firestore
}

export { app, auth, storage, db }
