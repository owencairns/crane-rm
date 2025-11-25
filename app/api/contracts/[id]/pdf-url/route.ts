import { NextRequest, NextResponse } from 'next/server'
import { adminDb, adminStorage, CONTRACTS_COLLECTION } from '@/lib/firebase-admin'
import { verifyAuthToken } from '@/lib/auth-utils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify authentication
    const userId = await verifyAuthToken(request)
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { id: contractId } = await params

    // Get contract from Firestore
    const contractDoc = await adminDb.collection(CONTRACTS_COLLECTION).doc(contractId).get()

    if (!contractDoc.exists) {
      return NextResponse.json({ message: 'Contract not found' }, { status: 404 })
    }

    const contract = contractDoc.data()

    // Verify ownership
    if (contract?.userId !== userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 403 })
    }

    // Get storage path
    const storagePath = contract?.storagePath
    if (!storagePath) {
      return NextResponse.json({ message: 'Contract file not found' }, { status: 404 })
    }

    // Generate signed URL (valid for 1 hour)
    const bucket = adminStorage.bucket()
    const file = bucket.file(storagePath)

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    })

    return NextResponse.json({ url })
  } catch (error: any) {
    console.error('Error getting PDF URL:', error)
    return NextResponse.json(
      { message: error.message || 'Failed to get PDF URL' },
      { status: 500 }
    )
  }
}
