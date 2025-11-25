import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080'

export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * GET /api/contracts/[id]/results
 * Get analysis results from backend
 */
export async function GET(
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
    const response = await fetch(`${BACKEND_URL}/api/results/${contractId}`, {
      method: 'GET',
      headers: {
        'Authorization': authToken,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Backend request failed' }))
      return NextResponse.json(
        { error: 'Results fetch failed', message: error.message },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json(data)
  } catch (error) {
    console.error('Results fetch error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch results',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
