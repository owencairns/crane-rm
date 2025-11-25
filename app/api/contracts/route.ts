import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb, CONTRACTS_COLLECTION, JOBS_COLLECTION, FINDINGS_COLLECTION } from '@/lib/firebase-admin'

export const runtime = 'nodejs'

/**
 * GET /api/contracts
 * Get all contracts for the authenticated user
 */
export async function GET(request: NextRequest) {
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

    // Get contracts for this user
    console.log(`Querying contracts for user: ${userId}`)
    const contractsSnapshot = await adminDb
      .collection(CONTRACTS_COLLECTION)
      .where('userId', '==', userId)
      .get()

    console.log(`Query returned ${contractsSnapshot.docs.length} documents`)

    const contracts = contractsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    // Sort by uploadedAt in code (to avoid needing composite index)
    contracts.sort((a: any, b: any) => {
      const aTime = a.uploadedAt?.toMillis?.() || 0
      const bTime = b.uploadedAt?.toMillis?.() || 0
      return bTime - aTime
    })

    console.log(`Found ${contracts.length} contracts for user ${userId}`)

    if (contracts.length > 0) {
      console.log('Sample contract data:', JSON.stringify(contracts[0], null, 2))
    }

    // Get latest analysis status for each contract
    const contractsWithStatus = await Promise.all(
      contracts.map(async (contract: any) => {
        console.log(`Processing contract ${contract.id}:`, {
          filename: contract.filename,
          status: contract.status,
          gcName: contract.gcName,
          uploadedAt: contract.uploadedAt
        })
        // Get latest analysis from subcollection
        const analysesSnapshot = await adminDb
          .collection(CONTRACTS_COLLECTION)
          .doc(contract.id)
          .collection('analyses')
          .orderBy('startedAt', 'desc')
          .limit(1)
          .get()

        const latestAnalysis = analysesSnapshot.docs[0]?.data()

        // Get risk score if analysis is complete
        let riskScore: number | undefined
        if (latestAnalysis?.status === 'complete' && latestAnalysis.summaryCounts) {
          // Calculate risk score from summary counts
          const counts = latestAnalysis.summaryCounts
          const criticalWeight = counts.criticalMatched * 10
          const highWeight = counts.highMatched * 7
          const mediumWeight = counts.mediumMatched * 4
          const lowWeight = counts.lowMatched * 2

          const totalWeight = criticalWeight + highWeight + mediumWeight + lowWeight
          const totalFindings = counts.criticalMatched + counts.highMatched + counts.mediumMatched + counts.lowMatched

          if (totalFindings > 0) {
            // Scale: max possible is if all findings were critical
            const maxPossible = totalFindings * 10
            riskScore = Math.min(100, Math.round((totalWeight / maxPossible) * 100))
          }
        }

        const result = {
          id: contract.id,
          name: contract.filename || contract.fileName || 'Unknown',
          client: contract.gcName || 'Unknown Client',
          date: contract.uploadedAt?.toDate ?
            contract.uploadedAt.toDate().toLocaleDateString() :
            contract.uploadDate?.toDate ?
            contract.uploadDate.toDate().toLocaleDateString() :
            new Date().toLocaleDateString(),
          status: contract.status || 'uploaded',
          riskScore,
        }

        console.log(`Returning contract ${contract.id}:`, result)
        return result
      })
    )

    console.log(`Returning ${contractsWithStatus.length} contracts with status`)
    return NextResponse.json(contractsWithStatus)
  } catch (error) {
    console.error('Error getting contracts:', error)
    return NextResponse.json(
      {
        error: 'Failed to get contracts',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
