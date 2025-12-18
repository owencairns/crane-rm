import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  getContract,
  updateContract,
  createChunk,
  updateChunk,
  downloadPdfFromStorage,
  verifyContractOwnership,
  findContractByChunkHashes,
  getChunks,
} from '../services/firebase.service';
import { parsePdf, chunkText, generateChunkId } from '../services/pdf.service';
import {
  generateEmbeddingsBatch,
  estimateTokens,
} from '../services/embedding.service';
import { upsertVectorsBatch, getVectorById } from '../services/pinecone.service';
import { getProvisionCatalogVersion } from '../services/provision.service';
import type { Chunk, PineconeMetadata } from '../models/types';
import { startAnalysis } from './analyze';

const router = Router();

// POST /ingest/:contractId - Process uploaded contract
router.post('/:contractId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { contractId } = req.params;
    const userId = req.userId!;

    // Verify ownership
    const hasAccess = await verifyContractOwnership(contractId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get contract
    const contract = await getContract(contractId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.status !== 'uploaded') {
      return res.status(400).json({
        error: `Contract cannot be processed in status: ${contract.status}`,
      });
    }

    // Process contract and wait for completion (keeps Cloud Run instance alive)
    await processContractAsync(contractId, userId, contract.storagePath);
    console.log(`Contract ${contractId} processed successfully`);

    res.json({
      message: 'Contract processing complete',
      contractId,
      status: 'complete',
    });
  } catch (error) {
    console.error('Error starting contract processing:', error);
    res.status(500).json({ error: 'Failed to start processing' });
  }
});

async function processContractAsync(
  contractId: string,
  userId: string,
  storagePath: string
): Promise<void> {
  try {
    // Step B: Parse PDF
    console.log(`Downloading PDF for contract ${contractId}`);
    const pdfBuffer = await downloadPdfFromStorage(storagePath);

    console.log(`Parsing PDF for contract ${contractId}`);
    const { blocks, pageCount } = await parsePdf(pdfBuffer);

    // Step C: Chunk
    console.log(`Chunking text for contract ${contractId}`);
    const chunks = chunkText(blocks);

    // Check for duplicate content by comparing chunk hashes
    const chunkHashes = chunks.map(c => c.textHash);
    const duplicateContractId = await findContractByChunkHashes(userId, chunkHashes);

    if (duplicateContractId) {
      console.log(`⚠️  Duplicate detected! Contract ${contractId} is identical to existing contract ${duplicateContractId}`);
      console.log(`Copying chunks and embeddings from ${duplicateContractId} instead of re-processing...`);

      // Get existing chunks from duplicate contract
      const existingChunks = await getChunks(duplicateContractId);

      // Copy chunks to new contract (with new chunk IDs)
      const copyPromises = existingChunks.map((existingChunk, index) => {
        const newChunkId = generateChunkId(contractId, index);
        const newChunkData: Chunk = {
          ...existingChunk,
          chunkId: newChunkId,
          contractId: contractId,
          userId,
        };
        return createChunk(contractId, newChunkId, newChunkData);
      });
      await Promise.all(copyPromises);

      // Copy Pinecone vectors from existing contract
      console.log(`Copying ${existingChunks.length} vectors to Pinecone...`);
      const existingVectors = await Promise.all(
        existingChunks.map(async (chunk) => {
          const vector = await getVectorById(chunk.chunkId);
          return vector;
        })
      );

      const newVectors = existingVectors.map((vector, index) => ({
        chunkId: generateChunkId(contractId, index),
        embedding: vector.values,
        metadata: {
          ...vector.metadata,
          contractId: contractId,
          chunkId: generateChunkId(contractId, index),
        } as PineconeMetadata,
      }));

      await upsertVectorsBatch(newVectors);

      await updateContract(contractId, {
        status: 'embedded',
        pageCount,
        chunkCount: chunks.length,
        provisionCatalogVersion: getProvisionCatalogVersion(),
      });

      console.log(`✅ Duplicate contract processed by copying from ${duplicateContractId}`);

      // Auto-trigger analysis for duplicate too
      console.log(`🔍 Auto-starting analysis for duplicate contract ${contractId}`);
      try {
        await startAnalysis(contractId, userId);
        console.log(`✅ Analysis started automatically for contract ${contractId}`);
      } catch (error) {
        console.error(`Failed to auto-start analysis for ${contractId}:`, error);
      }

      return;
    }

    await updateContract(contractId, {
      status: 'parsed',
      pageCount,
      chunkCount: chunks.length,
      provisionCatalogVersion: getProvisionCatalogVersion(),
    });

    // Save chunks to Firestore
    console.log(`Saving ${chunks.length} chunks to Firestore`);
    const chunkPromises = chunks.map((chunk, index) => {
      const chunkId = generateChunkId(contractId, index);
      const chunkData: Chunk = {
        chunkId,
        userId,
        contractId,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        sectionPath: chunk.sectionPath || null,
        text: chunk.text,
        textHash: chunk.textHash,
        embeddingStatus: 'pending',
      };
      return createChunk(contractId, chunkId, chunkData);
    });
    await Promise.all(chunkPromises);

    // Step D: Embed & upsert to Pinecone
    console.log(`Generating embeddings for ${chunks.length} chunks`);

    // Process in batches to avoid overwhelming the API
    const batchSize = 20;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batchChunks = chunks.slice(i, i + batchSize);
      const batchTexts = batchChunks.map((c) => c.text);

      // Generate embeddings
      const embeddings = await generateEmbeddingsBatch(batchTexts);

      // Prepare vectors for Pinecone
      const vectors = batchChunks.map((chunk, batchIndex) => {
        const chunkId = generateChunkId(contractId, i + batchIndex);
        const metadata: PineconeMetadata = {
          userId,
          contractId,
          chunkId,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          sectionPath: chunk.sectionPath || '',
          textPreview: chunk.text.slice(0, 200),
        };

        return {
          chunkId,
          embedding: embeddings[batchIndex],
          metadata,
        };
      });

      // Upsert to Pinecone
      await upsertVectorsBatch(vectors);

      // Mark chunks as embedded
      const updatePromises = batchChunks.map((_, batchIndex) => {
        const chunkId = generateChunkId(contractId, i + batchIndex);
        return updateChunk(contractId, chunkId, { embeddingStatus: 'done' });
      });
      await Promise.all(updatePromises);

      console.log(
        `Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`
      );
    }

    // Mark contract as embedded
    await updateContract(contractId, {
      status: 'embedded',
    });

    console.log(
      `Contract ${contractId} successfully processed with ${chunks.length} chunks`
    );

    // Auto-trigger analysis
    console.log(`🔍 Auto-starting analysis for contract ${contractId}`);
    try {
      await startAnalysis(contractId, userId);
      console.log(`✅ Analysis started automatically for contract ${contractId}`);
    } catch (error) {
      console.error(`Failed to auto-start analysis for ${contractId}:`, error);
      // Don't fail the whole ingestion if analysis fails to start
    }
  } catch (error) {
    console.error(`Error in processContractAsync for ${contractId}:`, error);
    await updateContract(contractId, { status: 'failed' });
    throw error;
  }
}

export default router;
