import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  getContract,
  verifyContractOwnership,
  deleteContract,
  getChunks,
} from '../services/firebase.service';
import { deleteFile } from '../services/firebase.service';
import { deleteVectorsByIds } from '../services/pinecone.service';

const router = Router();

// DELETE /delete/:contractId - Delete contract and all associated data
router.delete('/:contractId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { contractId } = req.params;
    const userId = req.userId!;

    console.log(`\n=== DELETE REQUEST RECEIVED ===`);
    console.log(`Contract ID: ${contractId}`);
    console.log(`User ID: ${userId}`);

    // Verify ownership
    const hasAccess = await verifyContractOwnership(contractId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get contract details
    const contract = await getContract(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    console.log(`Contract found: ${contract.filename} with ${contract.chunkCount || 0} chunks`);

    // Get all chunks to delete from Pinecone
    const chunks = await getChunks(contractId);
    const chunkIds = chunks.map(chunk => chunk.chunkId);

    console.log(`Found ${chunks.length} chunks to delete`);

    // Delete in parallel for efficiency
    const deletePromises: Promise<any>[] = [];

    // 1. Delete from Pinecone
    if (chunkIds.length > 0) {
      console.log(`Deleting ${chunkIds.length} vectors from Pinecone...`);
      deletePromises.push(
        deleteVectorsByIds(chunkIds).catch(err => {
          console.error('Failed to delete from Pinecone:', err);
          // Don't fail the whole operation if Pinecone delete fails
        })
      );
    }

    // 2. Delete file from Storage
    if (contract.storagePath) {
      console.log(`Deleting file from Storage: ${contract.storagePath}`);
      deletePromises.push(
        deleteFile(contract.storagePath).catch(err => {
          console.error('Failed to delete from Storage:', err);
          // Don't fail the whole operation if Storage delete fails
        })
      );
    }

    // Wait for storage/pinecone deletions
    await Promise.all(deletePromises);

    // 3. Delete from Firestore (this deletes contract, chunks, and analyses)
    console.log(`Deleting contract from Firestore...`);
    await deleteContract(contractId, userId);

    console.log(`✅ Successfully deleted contract ${contractId}`);

    res.json({
      message: 'Contract deleted successfully',
      contractId,
    });
  } catch (error) {
    console.error('Error deleting contract:', error);
    res.status(500).json({
      error: 'Failed to delete contract',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
