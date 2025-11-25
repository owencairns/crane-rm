import { NextRequest, NextResponse } from 'next/server'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute timeout

/**
 * POST /api/contracts/upload
 * Upload a contract PDF to Firebase Storage
 */
export async function POST(request: NextRequest) {
  try {
    // Get the file from form data
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      )
    }

    // Validate file size (25MB max)
    const maxSize = 25 * 1024 * 1024 // 25MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size exceeds 25MB limit' },
        { status: 400 }
      )
    }

    // Get user ID from auth (you'll need to implement auth verification)
    // For now, we'll use a placeholder - you should verify the user's Firebase token
    const userId = request.headers.get('x-user-id') || 'demo-user'

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Generate unique file path
    const timestamp = Date.now()
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const storagePath = `contracts/${userId}/${timestamp}_${sanitizedFileName}`

    // Upload to Firebase Storage
    const storage = getStorage()
    const storageRef = ref(storage, storagePath)
    await uploadBytes(storageRef, buffer, {
      contentType: 'application/pdf',
    })

    // Get download URL
    const downloadURL = await getDownloadURL(storageRef)

    // Create contract record in Firestore
    const db = getFirestore()
    const contractRef = await addDoc(collection(db, 'contracts'), {
      userId,
      fileName: file.name,
      uploadDate: serverTimestamp(),
      storagePath,
      downloadURL,
      pageCount: 0, // Will be updated by backend after extraction
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    return NextResponse.json({
      success: true,
      contractId: contractRef.id,
      fileName: file.name,
      storagePath,
      message: 'File uploaded successfully',
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      {
        error: 'Upload failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
