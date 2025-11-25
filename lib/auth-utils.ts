import { NextRequest } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'

/**
 * Verifies the Firebase ID token from the Authorization header
 * Returns the user ID if successful, null otherwise
 */
export async function verifyAuthToken(request: NextRequest): Promise<string | null> {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }

    const token = authHeader.split('Bearer ')[1]

    // Verify the token with Firebase Admin
    const decodedToken = await adminAuth.verifyIdToken(token)
    return decodedToken.uid
  } catch (error) {
    console.error('Error verifying auth token:', error)
    return null
  }
}
