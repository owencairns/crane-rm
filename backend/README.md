# CertMaster Crane Backend

Backend API service for CertMaster Crane contract analysis system.

## Architecture Overview

This backend implements a comprehensive contract analysis pipeline using:
- **Firestore**: Primary database for contracts, chunks, analyses, and findings
- **Pinecone**: Vector database for semantic search across contract chunks
- **OpenAI**: Embeddings (text-embedding-3-small) and analysis (gpt-4o-mini)
- **AI SDK**: Agent framework for provision-by-provision analysis

## Data Model

### Firestore Collections

#### `contracts/{contractId}`
```typescript
{
  userId: string
  storagePath: string  // Firebase Storage path
  filename: string
  uploadedAt: Date
  status: 'uploaded' | 'parsed' | 'embedded' | 'analyzing' | 'complete' | 'failed'
  pageCount?: number
  chunkCount?: number
  provisionCatalogVersion?: string
  projectName?: string
  gcName?: string
  state?: string
}
```

#### `contracts/{contractId}/chunks/{chunkId}`
```typescript
{
  chunkId: string
  userId: string
  contractId: string
  pageStart: number
  pageEnd: number
  sectionPath?: string  // e.g., "SECTION 1.2.3"
  text: string
  textHash: string  // For deduplication
  embeddingStatus: 'pending' | 'done' | 'failed'
}
```

#### `contracts/{contractId}/analyses/{analysisId}`
```typescript
{
  userId: string
  contractId: string
  startedAt: Date
  completedAt?: Date
  model: string  // e.g., "gpt-4o-mini"
  status: 'running' | 'complete' | 'failed'
  summaryCounts?: {
    criticalMatched: number
    highMatched: number
    mediumMatched: number
    lowMatched: number
  }
}
```

#### `contracts/{contractId}/analyses/{analysisId}/findings/{provisionId}`
```typescript
{
  provisionId: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  matched: boolean
  confidence: number  // 0-1
  evidenceChunkIds: string[]
  evidencePages: number[]
  evidenceExcerpts: string[]
  reasoningSummary: string
  recommendedAction?: string
  createdAt: Date
}
```

### Pinecone Index

Single multi-tenant index with metadata filtering:

```typescript
{
  id: string  // e.g., "contractId_chunk_0042"
  values: number[]  // embedding vector
  metadata: {
    userId: string
    contractId: string
    chunkId: string
    pageStart: number
    pageEnd: number
    sectionPath?: string
    textPreview: string  // First ~200 chars
  }
}
```

**Security**: Every query MUST filter by `userId` + `contractId`

## API Endpoints

### POST `/api/ingest/:contractId`
Starts the ingest pipeline for an uploaded contract.

**Flow**:
1. Download PDF from Firebase Storage
2. Parse PDF text with page numbers
3. Chunk by structure (headings/sections) + token limits
4. Save chunks to Firestore
5. Generate embeddings in batches
6. Upsert to Pinecone with metadata
7. Mark contract as `embedded`

**Request**: Requires Firebase Auth token
**Response**: `{ message, contractId, status }`

### POST `/api/analyze/:contractId`
Starts AI agent analysis of contract provisions.

**Flow**:
1. Create analysis record
2. For each provision (Critical → Low priority):
   - Agent generates retrieval queries
   - Agent calls `search_chunks` tool
   - Agent calls `get_chunk` to verify
   - Agent calls `get_adjacent_chunks` if needed
   - Agent decides matched/confidence
   - Agent calls `record_finding`
3. Calculate summary counts
4. Mark analysis as `complete`

**Request**: Requires Firebase Auth token
**Response**: `{ message, analysisId, contractId, provisionCount }`

### GET `/api/results/:contractId/analyses/:analysisId`
Retrieves analysis results with all findings.

**Response**:
```json
{
  "analysis": { ... },
  "findings": [ ... ],
  "findingCount": 12
}
```

### GET `/api/results/:contractId`
Retrieves contract details.

**Response**: `{ contract: { ... } }`

## AI Agent Tools

The agent has access to 5 tools for contract analysis:

### 1. `search_chunks`
Semantic vector search across contract chunks.
- Input: `{ query: string, topK?: number }`
- Returns: `{ chunkId, pageStart, pageEnd, score, textPreview }[]`

### 2. `get_chunk`
Fetch full text of a specific chunk.
- Input: `{ chunkId: string }`
- Returns: `{ chunkId, pageStart, pageEnd, sectionPath?, text }`

### 3. `get_adjacent_chunks`
Get chunks before/after a reference chunk (for context).
- Input: `{ chunkId: string, window?: number }`
- Returns: Array of chunk objects

### 4. `record_finding`
Store provision analysis result.
- Input: `{ provisionId, priority, matched, confidence, evidenceChunkIds, evidencePages, evidenceExcerpts, reasoningSummary, recommendedAction? }`
- Returns: `{ ok: true }`

### 5. `exact_find`
Keyword/pattern matching fallback.
- Input: `{ patterns: string[] }`
- Returns: `{ matches: [{ chunkId, page, snippet, pattern }] }`

## Provision Catalog

Server-side versioned catalog of provisions to check. Located in:
`src/services/provision.service.ts`

Each provision includes:
- `provisionId`: Unique identifier
- `priority`: critical | high | medium | low
- `canonicalWording`: Standard phrasing
- `synonyms`: Alternative phrasings to search for
- `definition`: What this provision means
- `falsePositiveTraps`: Things that DON'T count
- `confidenceRubric`: Scoring guidelines

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Server
PORT=3001
NODE_ENV=development

# Firebase Admin
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com

# Pinecone
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX_NAME=certmaster-contracts
PINECONE_ENVIRONMENT=us-east1-aws

# OpenAI
OPENAI_API_KEY=sk-...
```

## Development

```bash
# Install dependencies
npm install

# Run in development (with hot reload)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Type check
npm run type-check
```

## Security Model

### Multi-Tenant Isolation

1. **Firebase Auth**: All endpoints require valid Firebase Auth token
2. **Ownership Verification**: Every operation checks `contract.userId === auth.userId`
3. **Pinecone Filtering**: Every vector query includes `{ userId, contractId }` filter
4. **No Cross-Tenant Access**: Users can ONLY access their own contracts

### Authentication Flow

```typescript
// Client sends request with Authorization header
Authorization: Bearer <firebase-id-token>

// Server verifies token
const decodedToken = await auth.verifyIdToken(token);
const userId = decodedToken.uid;

// Server verifies ownership
const contract = await getContract(contractId);
if (contract.userId !== userId) {
  throw new Error('Access denied');
}
```

## Accuracy Guardrails

1. **Two-Step Verification**: Retrieval doesn't equal match - agent must quote and explain
2. **Neighbor Context**: Require adjacent chunks when language is conditional
3. **No Evidence → No Match**: Hard rule enforced by prompts
4. **Confidence Scoring**:
   - 0.9+: Explicit clause
   - 0.6-0.89: Strong paraphrase
   - 0.4-0.59: Weak (mark matched=false unless very strong)
   - <0.4: Not found

## Performance Optimizations

- **Embed Once, Analyze Many**: Embeddings are cached in Pinecone
- **Batch Processing**: Embeddings generated in batches of 20
- **Pinecone Batching**: Upserts in batches of 100
- **Idempotent Ingest**: Can safely rerun if it crashes (checks `embeddingStatus`)
- **Limited Retrieval**: TopK capped at 8 per provision query

## Project Structure

```
backend/
├── src/
│   ├── agents/          # AI agent logic
│   │   ├── prompts.ts   # System/task/provision prompts
│   │   ├── runner.ts    # Main analysis orchestrator
│   │   └── tools.ts     # Agent tool definitions
│   ├── config/          # Configuration
│   │   └── index.ts     # Environment config
│   ├── middleware/      # Express middleware
│   │   ├── auth.ts      # Firebase Auth verification
│   │   └── errorHandler.ts
│   ├── models/          # TypeScript types
│   │   └── types.ts     # All data model types
│   ├── routes/          # API endpoints
│   │   ├── analyze.ts   # POST /analyze/:contractId
│   │   ├── ingest.ts    # POST /ingest/:contractId
│   │   └── results.ts   # GET /results/...
│   ├── services/        # Business logic
│   │   ├── embedding.service.ts    # OpenAI embeddings
│   │   ├── firebase.service.ts     # Firestore operations
│   │   ├── pdf.service.ts          # PDF parsing & chunking
│   │   ├── pinecone.service.ts     # Vector operations
│   │   └── provision.service.ts    # Provision catalog
│   └── index.ts         # Express server entry point
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Adding New Provisions

Edit `src/services/provision.service.ts`:

```typescript
const PROVISION_CATALOG: Provision[] = [
  {
    provisionId: 'your-new-provision',
    priority: 'high',
    canonicalWording: 'Standard language...',
    synonyms: ['variant 1', 'variant 2'],
    definition: 'What this means...',
    falsePositiveTraps: ['Things that don\'t count'],
    confidenceRubric: {
      explicit: 'What counts as 0.9+',
      strongParaphrase: 'What counts as 0.6-0.89',
      weak: 'What counts as 0.4-0.59'
    }
  },
  // ... other provisions
];
```

## Troubleshooting

### Pinecone connection issues
- Verify `PINECONE_API_KEY` is correct
- Check index name matches: `PINECONE_INDEX_NAME`
- Ensure index dimension matches embedding model (1536 for text-embedding-3-small)

### Firebase auth errors
- Verify service account credentials are correct
- Check `FIREBASE_PRIVATE_KEY` has proper newline escaping: `\\n`
- Ensure Firebase project ID matches

### Analysis not completing
- Check agent tool execution in logs
- Verify OpenAI API key has credits
- Check for rate limiting (429 errors)
- Review provision prompts for clarity

## License

Proprietary - Red Cedar Insurance Services
