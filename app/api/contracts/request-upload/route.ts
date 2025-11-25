import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb, CONTRACTS_COLLECTION } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

/**
 * POST /api/contracts/request-upload
 * Get a signed URL for uploading a contract
 */
export async function POST(request: NextRequest) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing or invalid Authorization header' },
        { status: 401 }
      )
    }

    const token = authHeader.split('Bearer ')[1]

    // Verify the token with Firebase Admin
    const decodedToken = await adminAuth.verifyIdToken(token)
    const userId = decodedToken.uid

    // Get request body
    const { fileName, contentType } = await request.json()

    if (!fileName) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'fileName is required' },
        { status: 400 }
      )
    }

    // Generate unique storage path
    const timestamp = Date.now()
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
    const storagePath = `contracts/${userId}/${timestamp}_${sanitizedFileName}`

    // Create contract record in Firestore
    const contractRef = await adminDb.collection(CONTRACTS_COLLECTION).add({
      userId,
      fileName,
      uploadDate: new Date(),
      storagePath,
      pageCount: 0,
      status: 'uploaded',
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    return NextResponse.json({
      contractId: contractRef.id,
      storagePath,
    })
  } catch (error) {
    console.error('Request upload error:', error)
    return NextResponse.json(
      {
        error: 'Failed to request upload',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
