import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb, CONTRACTS_COLLECTION } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

/**
 * GET /api/contracts/[id]
 * Get a specific contract
 */
export async function GET(
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

    const contract = { id: contractDoc.id, ...contractDoc.data() }

    // Verify ownership
    if (contract.userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this contract' },
        { status: 403 }
      )
    }

    return NextResponse.json(contract)
  } catch (error) {
    console.error('Error getting contract:', error)
    return NextResponse.json(
      {
        error: 'Failed to get contract',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
