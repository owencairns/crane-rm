# CertMaster Crane

AI-powered PDF contract review for crane and rigging workflows.

## Current Architecture

- `Next.js 16` app for the UI
- `Convex` for database, file storage, auth integration, mutations, queries, and background actions
- `Better Auth` for email/password authentication, backed by Convex
- `OpenAI` embeddings for chunk/vector generation
- `Pinecone` for semantic retrieval
- `Google Gemini` via the Vercel AI SDK for provision verification

The old Firebase and Express-based contract pipeline is no longer part of the active app flow.

## Project Layout

```text
certmaster-crane/
├── app/                    # Next.js app router pages
├── components/             # UI components
├── contexts/               # Client auth/session context
├── convex/                 # Convex schema, functions, actions, auth, and analysis pipeline
├── lib/                    # Shared client/server helpers
└── package.json
```

## What Runs Where

- Upload requests, contract reads, result reads, and status data come from Convex queries/mutations in `convex/contracts.ts`.
- PDF ingestion, chunking, duplicate detection, embeddings, Pinecone indexing, and AI analysis run in Convex Node actions in `convex/contractNode.ts`.
- The only remaining Next API route is `app/api/auth/[...all]/route.ts`, which exposes Better Auth over HTTP for the browser session flow.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start Convex and generate local env values:

```bash
npx convex dev
```

3. Add the required AI env vars to `.env.local`:

```env
OPENAI_API_KEY=...
PINECONE_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...

# Optional overrides
PINECONE_INDEX_NAME=certmaster-contracts
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
GOOGLE_ANALYSIS_MODEL=gemini-3-flash-preview
SITE_URL=http://localhost:3000
```

`convex dev` will also populate the Convex deployment variables used by the app, including:

```env
CONVEX_DEPLOYMENT=...
NEXT_PUBLIC_CONVEX_URL=...
NEXT_PUBLIC_CONVEX_SITE_URL=...
```

4. Run the app:

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Next.js |
| `npm run dev:next` | Start Next.js |
| `npm run dev:convex` | Start Convex dev |
| `npm run dev:all` | Start Next.js and Convex together |
| `npm run build` | Build Next.js |
| `npm run start` | Start Next.js in production |
| `npm run lint` | Run ESLint |
| `npm run convex:codegen` | Generate Convex types |

## Authentication

- Auth is now email/password only.
- Session state is provided through Better Auth + Convex.
- The previous Firebase Auth and Google sign-in flow have been removed from the active application path.

## Contract Processing Flow

1. The dashboard requests a Convex upload URL.
2. The browser uploads the PDF directly to Convex file storage.
3. A Convex mutation marks the contract as uploaded and schedules processing.
4. A Convex Node action parses the PDF, chunks text, checks for duplicates, generates embeddings, and upserts vectors into Pinecone.
5. The same action runs the Gemini-based provision analysis workflow and stores findings back in Convex.
6. The dashboard and contract detail pages read live contract and analysis state directly from Convex.

## Verification

The current migration has been validated with:

```bash
npm run lint
npx tsc --noEmit
```
