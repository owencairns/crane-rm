import * as admin from 'firebase-admin'
import { getStorage } from 'firebase-admin/storage'
import { getFirestore } from 'firebase-admin/firestore'

// Initialize Firebase Admin
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  })
}

export const adminAuth = admin.auth()
export const adminStorage = getStorage()
export const adminDb = getFirestore()

// Collection names
export const CONTRACTS_COLLECTION = 'contracts'
export const JOBS_COLLECTION = 'analysisJobs'
export const FINDINGS_COLLECTION = 'findings'
