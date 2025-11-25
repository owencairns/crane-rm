import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080'

export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * POST /api/contracts/[id]/analyze
 * Trigger backend analysis for a contract
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params

    // Get auth token from request header
    const authToken = request.headers.get('authorization')

    if (!authToken) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing authorization header' },
        { status: 401 }
      )
    }

    // Forward request to backend
    const response = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authToken,
      },
      body: JSON.stringify({ contractId }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Backend request failed' }))
      return NextResponse.json(
        { error: 'Analysis failed', message: error.message },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json(data)
  } catch (error) {
    console.error('Analysis trigger error:', error)
    return NextResponse.json(
      {
        error: 'Failed to start analysis',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
