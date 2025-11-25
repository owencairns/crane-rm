import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb, adminStorage, CONTRACTS_COLLECTION } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

/**
 * POST /api/contracts/[id]/confirm
 * Confirm that a contract has been uploaded
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params

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

    // Get contract
    const contractDoc = await adminDb
      .collection(CONTRACTS_COLLECTION)
      .doc(contractId)
      .get()

    if (!contractDoc.exists) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Contract not found' },
        { status: 404 }
      )
    }

    const contract = contractDoc.data()

    // Verify ownership
    if (contract?.userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this contract' },
        { status: 403 }
      )
    }

    // Verify file exists in storage
    const bucket = adminStorage.bucket()
    const file = bucket.file(contract.storagePath)
    const [exists] = await file.exists()

    if (!exists) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'File has not been uploaded yet' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      message: 'Contract upload confirmed',
      contractId,
    })
  } catch (error) {
    console.error('Confirm upload error:', error)
    return NextResponse.json(
      {
        error: 'Failed to confirm upload',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
