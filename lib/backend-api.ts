import { auth } from '@/lib/firebase'

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'

/**
 * Get the current user's auth token
 */
async function getAuthToken(): Promise<string> {
  const user = auth.currentUser

  if (!user) {
    throw new Error('User not authenticated')
  }

  try {
    // Get fresh token (force refresh if needed)
    const token = await user.getIdToken(false)
    return token
  } catch (error) {
    console.error('Error getting auth token:', error)
    throw new Error('Failed to get authentication token. Please sign in again.')
  }
}

/**
 * Make an authenticated request to Next.js API routes
 */
async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const token = await getAuthToken()

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      ...options?.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || `Request failed with status ${response.status}`)
  }

  return response.json()
}

/**
 * Make an authenticated request to the backend Express server (for analysis only)
 */
async function backendFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const token = await getAuthToken()

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers: {
      ...options?.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || `Request failed with status ${response.status}`)
  }

  return response.json()
}

export interface Contract {
  id: string
  name: string
  client: string
  date: string
  status: 'uploaded' | 'parsed' | 'embedded' | 'analyzing' | 'complete' | 'failed'
  riskScore?: number
  storagePath?: string
}

export interface ContractUploadResponse {
  contractId: string
  uploadUrl?: string
  storagePath: string
}

/**
 * Backend API client
 */
export const backendApi = {
  /**
   * Get all contracts for the current user
   */
  async getContracts() {
    return apiFetch<Contract[]>('/contracts')
  },

  /**
   * Get a specific contract
   */
  async getContract(contractId: string) {
    return apiFetch<Contract>(`/contracts/${contractId}`)
  },

  /**
   * Request a signed URL for contract upload
   */
  async requestUpload(fileName: string, contentType: string = 'application/pdf') {
    return apiFetch<ContractUploadResponse>('/contracts/request-upload', {
      method: 'POST',
      body: JSON.stringify({ fileName, contentType }),
    })
  },

  /**
   * Confirm contract upload
   */
  async confirmUpload(contractId: string) {
    return apiFetch<{ message: string; contractId: string }>(
      `/contracts/${contractId}/confirm`,
      {
        method: 'POST',
      }
    )
  },

  /**
   * Ingest contract (process PDF and generate embeddings)
   */
  async ingestContract(contractId: string) {
    return backendFetch<{
      message: string
      contractId: string
      status: string
    }>(`/api/ingest/${contractId}`, {
      method: 'POST',
    })
  },

  /**
   * Start contract analysis (calls backend Express server)
   */
  async startAnalysis(contractId: string) {
    return backendFetch<{
      message: string
      analysisId: string
      contractId: string
      provisionCount: number
    }>(`/api/analyze/${contractId}`, {
      method: 'POST',
    })
  },

  /**
   * Get analysis job status (calls backend Express server)
   */
  async getStatus(jobId: string) {
    return backendFetch<{
      jobId: string
      status: 'queued' | 'processing' | 'completed' | 'failed'
      progress: number
      currentStep: string
      error?: string
    }>(`/api/status/${jobId}`)
  },

  /**
   * Get analysis results (calls backend Express server)
   */
  async getResults(contractId: string) {
    return backendFetch<{
      contractId: string
      jobId: string
      status: string
      summary?: string
      findings: Array<{
        id: string
        priority: 'critical' | 'high' | 'medium' | 'low'
        matched: boolean
        confidence: number
        category: string
        title: string
        description: string
        pageReferences?: number[]
        evidenceExcerpts?: string[]
        recommendation?: string
      }>
      riskScore?: number
      completedAt?: Date
      error?: {
        message: string
        code?: string
        batchesFailed?: number
        batchesSucceeded?: number
      }
    }>(`/api/results/${contractId}`)
  },

  /**
   * Get a signed download URL for a contract PDF
   */
  async getPdfUrl(contractId: string) {
    return apiFetch<{ url: string }>(`/contracts/${contractId}/pdf-url`)
  },

  /**
   * Delete a contract and all associated data (calls backend Express server)
   */
  async deleteContract(contractId: string) {
    return backendFetch<{
      message: string
      contractId: string
    }>(`/api/delete/${contractId}`, {
      method: 'DELETE',
    })
  },
}
