import { auth } from '@/lib/firebase'

/**
 * Debug helper to check auth status
 */
export async function debugAuth() {
  const user = auth.currentUser

  console.log('=== Auth Debug ===')
  console.log('User:', user?.email || 'Not signed in')
  console.log('UID:', user?.uid || 'N/A')

  if (user) {
    try {
      const token = await user.getIdToken()
      console.log('Token (first 20 chars):', token.substring(0, 20) + '...')
      console.log('Token length:', token.length)

      // Decode token to see expiration
      const payload = JSON.parse(atob(token.split('.')[1]))
      const exp = new Date(payload.exp * 1000)
      const now = new Date()

      console.log('Token expires:', exp.toISOString())
      console.log('Token is valid:', exp > now)
      console.log('Time until expiration (minutes):', Math.floor((exp.getTime() - now.getTime()) / 1000 / 60))
    } catch (error) {
      console.error('Error getting token:', error)
    }
  }

  console.log('===============')
}
