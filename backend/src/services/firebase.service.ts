import admin from 'firebase-admin';
import { config } from '../config';
import type { Contract, Chunk, Analysis, Finding } from '../models/types';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      privateKey: config.firebase.privateKey,
      clientEmail: config.firebase.clientEmail,
    }),
    storageBucket: config.firebase.storageBucket,
  });
}

export const db = admin.firestore();
export const storage = admin.storage();
export const auth = admin.auth();

// Contract operations
export const contractsCollection = () => db.collection('contracts');

export async function getContract(contractId: string): Promise<Contract | null> {
  const doc = await contractsCollection().doc(contractId).get();
  if (!doc.exists) return null;
  return doc.data() as Contract;
}

export async function createContract(
  contractId: string,
  data: Contract
): Promise<void> {
  await contractsCollection().doc(contractId).set({
    ...data,
    uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function updateContract(
  contractId: string,
  data: Partial<Contract>
): Promise<void> {
  await contractsCollection().doc(contractId).update(data);
}

// Chunk operations
export const chunksCollection = (contractId: string) =>
  contractsCollection().doc(contractId).collection('chunks');

export async function getChunk(
  contractId: string,
  chunkId: string
): Promise<Chunk | null> {
  const doc = await chunksCollection(contractId).doc(chunkId).get();
  if (!doc.exists) return null;
  return doc.data() as Chunk;
}

export async function getChunks(
  contractId: string,
  chunkIds?: string[]
): Promise<Chunk[]> {
  const collection = chunksCollection(contractId);

  if (chunkIds && chunkIds.length > 0) {
    // Firestore has a limit of 10 for 'in' queries
    const chunks: Chunk[] = [];
    for (let i = 0; i < chunkIds.length; i += 10) {
      const batch = chunkIds.slice(i, i + 10);
      const snapshot = await collection
        .where(admin.firestore.FieldPath.documentId(), 'in', batch)
        .get();
      snapshot.docs.forEach((doc) => chunks.push(doc.data() as Chunk));
    }
    return chunks;
  }

  const snapshot = await collection.get();
  return snapshot.docs.map((doc) => doc.data() as Chunk);
}

export async function getAllChunksForUser(userId: string): Promise<{contractId: string, chunks: Chunk[]}[]> {
  // Get all contracts for this user
  const contractsSnapshot = await contractsCollection()
    .where('userId', '==', userId)
    .get();

  const results: {contractId: string, chunks: Chunk[]}[] = [];

  for (const contractDoc of contractsSnapshot.docs) {
    const contractId = contractDoc.id;
    const chunks = await getChunks(contractId);
    results.push({ contractId, chunks });
  }

  return results;
}

export async function findContractByChunkHashes(
  userId: string,
  chunkHashes: string[]
): Promise<string | null> {
  // Get all contracts with chunks for this user
  const allContracts = await getAllChunksForUser(userId);

  // Sort hashes for comparison
  const sortedNewHashes = [...chunkHashes].sort();

  for (const { contractId, chunks } of allContracts) {
    if (chunks.length !== chunkHashes.length) continue;

    // Get hashes from existing chunks
    const existingHashes = chunks.map(c => c.textHash).sort();

    // Compare all hashes
    const allMatch = sortedNewHashes.every((hash, idx) => hash === existingHashes[idx]);

    if (allMatch) {
      return contractId; // Found duplicate!
    }
  }

  return null; // No duplicate found
}

export async function getAdjacentChunks(
  contractId: string,
  chunkId: string,
  window: number = 1
): Promise<Chunk[]> {
  // Parse chunk number from chunkId (format: contractId_chunk_NNNN)
  const match = chunkId.match(/_chunk_(\d+)$/);
  if (!match) return [];

  const currentNum = parseInt(match[1], 10);
  const start = Math.max(0, currentNum - window);
  const end = currentNum + window;

  const adjacentIds: string[] = [];
  for (let i = start; i <= end; i++) {
    if (i !== currentNum) {
      adjacentIds.push(`${contractId}_chunk_${i.toString().padStart(4, '0')}`);
    }
  }

  return getChunks(contractId, adjacentIds);
}

export async function createChunk(
  contractId: string,
  chunkId: string,
  data: Chunk
): Promise<void> {
  await chunksCollection(contractId).doc(chunkId).set(data);
}

export async function updateChunk(
  contractId: string,
  chunkId: string,
  data: Partial<Chunk>
): Promise<void> {
  await chunksCollection(contractId).doc(chunkId).update(data);
}

// Analysis operations
export const analysesCollection = (contractId: string) =>
  contractsCollection().doc(contractId).collection('analyses');

export async function getAnalysis(
  contractId: string,
  analysisId: string
): Promise<Analysis | null> {
  const doc = await analysesCollection(contractId).doc(analysisId).get();
  if (!doc.exists) return null;
  return doc.data() as Analysis;
}

export async function createAnalysis(
  contractId: string,
  analysisId: string,
  data: Analysis
): Promise<void> {
  await analysesCollection(contractId).doc(analysisId).set({
    ...data,
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function updateAnalysis(
  contractId: string,
  analysisId: string,
  data: Partial<Analysis>
): Promise<void> {
  await analysesCollection(contractId).doc(analysisId).update(data);
}

export async function getLatestAnalysis(
  contractId: string
): Promise<{ analysis: Analysis; analysisId: string } | null> {
  const snapshot = await analysesCollection(contractId)
    .orderBy('startedAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    analysis: doc.data() as Analysis,
    analysisId: doc.id,
  };
}

// Finding operations
export const findingsCollection = (contractId: string, analysisId: string) =>
  analysesCollection(contractId).doc(analysisId).collection('findings');

export async function createFinding(
  contractId: string,
  analysisId: string,
  provisionId: string,
  data: Finding
): Promise<void> {
  await findingsCollection(contractId, analysisId).doc(provisionId).set({
    ...data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function getFindings(
  contractId: string,
  analysisId: string
): Promise<Finding[]> {
  const snapshot = await findingsCollection(contractId, analysisId).get();
  return snapshot.docs.map((doc) => doc.data() as Finding);
}

// Verify contract ownership
export async function verifyContractOwnership(
  contractId: string,
  userId: string
): Promise<boolean> {
  const contract = await getContract(contractId);
  return contract?.userId === userId;
}

// Download PDF from Storage
export async function downloadPdfFromStorage(
  storagePath: string
): Promise<Buffer> {
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  const [buffer] = await file.download();
  return buffer;
}

// Delete file from Storage
export async function deleteFile(storagePath: string): Promise<void> {
  const bucket = storage.bucket();
  const file = bucket.file(storagePath);
  await file.delete();
}

// Delete contract and all subcollections
export async function deleteContract(
  contractId: string,
  userId: string
): Promise<void> {
  // Verify ownership first
  const contract = await getContract(contractId);
  if (!contract || contract.userId !== userId) {
    throw new Error('Contract not found or access denied');
  }

  // Delete all subcollections (chunks, analyses, findings)
  const contractRef = contractsCollection().doc(contractId);

  // Delete chunks
  const chunksSnapshot = await chunksCollection(contractId).get();
  const chunkDeletePromises = chunksSnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(chunkDeletePromises);

  // Delete analyses and their findings
  const analysesSnapshot = await analysesCollection(contractId).get();
  for (const analysisDoc of analysesSnapshot.docs) {
    const findingsSnapshot = await findingsCollection(
      contractId,
      analysisDoc.id
    ).get();
    const findingDeletePromises = findingsSnapshot.docs.map(doc =>
      doc.ref.delete()
    );
    await Promise.all(findingDeletePromises);
    await analysisDoc.ref.delete();
  }

  // Finally delete the contract document
  await contractRef.delete();
}
