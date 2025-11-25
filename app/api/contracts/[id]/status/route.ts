import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080'

export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * GET /api/contracts/[id]/status?jobId=xxx
 * Get analysis job status from backend
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contractId } = await params
    const searchParams = request.nextUrl.searchParams
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'jobId query parameter is required' },
        { status: 400 }
      )
    }

    // Get auth token from request header
    const authToken = request.headers.get('authorization')

    if (!authToken) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Missing authorization header' },
        { status: 401 }
      )
    }

    // Forward request to backend
    const response = await fetch(`${BACKEND_URL}/api/status/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': authToken,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Backend request failed' }))
      return NextResponse.json(
        { error: 'Status check failed', message: error.message },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json(data)
  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json(
      {
        error: 'Failed to check status',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
