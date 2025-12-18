import * as admin from 'firebase-admin'
import { getStorage } from 'firebase-admin/storage'
import { getFirestore } from 'firebase-admin/firestore'

// Lazy initialization to prevent build-time errors
function getApp() {
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
  return admin.app()
}

// Export getters that lazily initialize Firebase Admin
export const getAdminAuth = () => {
  getApp()
  return admin.auth()
}

export const getAdminStorage = () => {
  getApp()
  return getStorage()
}

export const getAdminDb = () => {
  getApp()
  return getFirestore()
}

// Legacy exports for backwards compatibility (deprecated - use getters instead)
export const adminAuth = new Proxy({} as admin.auth.Auth, {
  get: (_, prop) => (getAdminAuth() as any)[prop],
})

export const adminStorage = new Proxy({} as ReturnType<typeof getStorage>, {
  get: (_, prop) => (getAdminStorage() as any)[prop],
})

export const adminDb = new Proxy({} as ReturnType<typeof getFirestore>, {
  get: (_, prop) => (getAdminDb() as any)[prop],
})

// Collection names
export const CONTRACTS_COLLECTION = 'contracts'
export const JOBS_COLLECTION = 'analysisJobs'
export const FINDINGS_COLLECTION = 'findings'
