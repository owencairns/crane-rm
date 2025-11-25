# Quick Start Guide

## ✅ What's Ready

Your backend is fully architected and ready to run! Here's what was built:

### Backend Service (Express + GPT-5-mini)
- ✅ Complete Express.js server with TypeScript
- ✅ Firebase Storage & Firestore integration
- ✅ PDF extraction with pdf-parse
- ✅ AI agent using OpenAI GPT-5-mini
- ✅ 4 specialized tools for contract analysis
- ✅ Async job processing with status updates
- ✅ Authentication middleware
- ✅ Docker configuration for Cloud Run
- ✅ All dependencies installed
- ✅ TypeScript compiles with no errors

### Frontend Integration
- ✅ API proxy routes in Next.js
- ✅ Backend API client library
- ✅ Environment configuration
- ✅ Integration documentation

## 🚀 Run It Now (3 Steps)

### Step 1: Configure Environment

```bash
cd certmaster-crane-backend
cp .env.example .env
```

Edit `.env` and add your credentials:
```bash
# Required:
OPENAI_API_KEY=sk-...                                    # From OpenAI
FIREBASE_PROJECT_ID=your-project-id                      # From Firebase Console
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@...          # From Firebase service account
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."  # From Firebase service account
FIREBASE_STORAGE_BUCKET=your-project.appspot.com        # From Firebase Console
```

### Step 2: Start the Server

```bash
npm run dev
```

You should see:
```
=================================
CertMaster Crane Backend
=================================
Environment: development
Port: 8080
Frontend URL: http://localhost:3000
Server started at: 2025-11-24T...
=================================
```

### Step 3: Test It

Open a new terminal and test the health endpoint:

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-24T..."
}
```

## 🧪 Test with a Contract

To test the full flow, you'll need:

1. A Firebase Auth token (from your frontend login)
2. A contract PDF uploaded to Firebase Storage
3. A contract record in Firestore

Example test:
```bash
# Get your Firebase token from the frontend (localStorage or browser dev tools)
TOKEN="your-firebase-id-token"

# Trigger analysis
curl -X POST http://localhost:8080/api/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contractId": "your-contract-id"}'

# Response: {"jobId": "...", "status": "queued", ...}

# Check status
curl http://localhost:8080/api/status/JOB_ID \
  -H "Authorization: Bearer $TOKEN"

# Get results (when complete)
curl http://localhost:8080/api/results/CONTRACT_ID \
  -H "Authorization: Bearer $TOKEN"
```

## 📁 Project Structure

```
certmaster-crane-backend/
├── src/
│   ├── index.ts              # ⭐ Start here
│   ├── routes/               # API endpoints
│   ├── ai/                   # ⭐ AI agent logic
│   ├── services/             # Firebase & PDF services
│   ├── middleware/           # Auth & error handling
│   └── types/                # TypeScript types
├── .env                      # Your secrets (create this)
├── package.json
├── Dockerfile
└── [Documentation files]
```

## 🔗 Connect Frontend

In your Next.js app:

1. **Add environment variable:**
```bash
# certmaster-crane/.env.local
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
BACKEND_URL=http://localhost:8080
```

2. **Use the API client:**
```typescript
import { backendApi } from '@/lib/backend-api'

// Start analysis
const { jobId } = await backendApi.startAnalysis(contractId)

// Poll status
const status = await backendApi.getStatus(jobId)

// Get results
const results = await backendApi.getResults(contractId)
```

See [INTEGRATION.md](../certmaster-crane/INTEGRATION.md) for complete frontend integration guide.

## 📊 How It Works

```
1. User uploads PDF
   ↓
2. Frontend → Backend: POST /api/analyze
   ↓
3. Backend downloads PDF from Firebase Storage
   ↓
4. Backend extracts text with pdf-parse
   ↓
5. AI Agent (GPT-5-mini) analyzes with tools:
   - searchContract (find keywords)
   - readPages (read specific sections)
   - checkForClause (verify clause presence)
   - recordFinding (save issues to Firestore)
   ↓
6. Frontend polls: GET /api/status/:jobId
   ↓
7. When complete → GET /api/results/:contractId
```

## 🎯 What The AI Looks For

The AI automatically searches for:
- ✅ **High Risk**: Indemnification, unlimited liability, inadequate insurance
- ✅ **Medium Risk**: Warranty issues, dispute resolution, IP concerns
- ✅ **Low Risk**: Standard boilerplate, routine requirements

Each finding includes:
- Severity level (high/medium/low)
- Category (e.g., "Indemnification")
- Clear description of the issue
- Page reference
- Actionable recommendation

## 🐳 Deploy to Cloud Run

When ready for production:

```bash
# Build and deploy
gcloud builds submit --config cloudbuild.yaml .
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## 📚 Documentation

- **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - Complete technical overview
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Deploy to Google Cloud Run
- **[INTEGRATION.md](../certmaster-crane/INTEGRATION.md)** - Frontend integration guide
- **[README.md](README.md)** - Basic project information

## 🔧 Development Commands

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm start            # Run production build
npm run type-check   # TypeScript type checking
```

## ❓ Troubleshooting

### "Cannot find module" errors
```bash
npm install
```

### Firebase authentication errors
- Check `.env` has correct Firebase credentials
- Verify Firebase service account has proper permissions
- Ensure FIREBASE_PRIVATE_KEY is properly escaped (keep `\n` as literal `\n`)

### OpenAI API errors
- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI account has credits
- Ensure you're using the correct model name: `gpt-5-mini`

### Port already in use
```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Or use different port
PORT=8081 npm run dev
```

## 🎓 Learn the Code

Recommended reading order:
1. [src/index.ts](src/index.ts) - See how the server is structured
2. [src/ai/prompts.ts](src/ai/prompts.ts) - Understand the AI's instructions
3. [src/ai/tools.ts](src/ai/tools.ts) - See what the AI can do
4. [src/ai/agent.ts](src/ai/agent.ts) - Main analysis logic
5. [src/routes/analyze.ts](src/routes/analyze.ts) - API endpoint handling

## ✅ Next Steps

1. ✅ Backend is built and ready
2. ✅ Dependencies installed
3. ✅ TypeScript compiles
4. 🔲 Add your `.env` credentials
5. 🔲 Start the server (`npm run dev`)
6. 🔲 Test with health check
7. 🔲 Connect frontend
8. 🔲 Test with real contract PDF
9. 🔲 Deploy to Cloud Run

---

**You're ready to go! Start with Step 1 above.** 🚀
