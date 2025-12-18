import express from 'express';
import cors from 'cors';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { initializePinecone } from './services/pinecone.service';
import { initializeProvisionEmbeddings } from './services/prescreening.service';
import { getProvisionCatalog } from './services/provision.service';

// Import routes
import ingestRouter from './routes/ingest';
import analyzeRouter from './routes/analyze';
import resultsRouter from './routes/results';
import deleteRouter from './routes/delete';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/ingest', ingestRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/results', resultsRouter);
app.use('/api/delete', deleteRouter);

// Error handler (must be last)
app.use(errorHandler);

// Initialize services and start server
async function start() {
  try {
    console.log('Initializing services...');

    // Initialize Pinecone
    await initializePinecone();
    console.log('Pinecone initialized');

    // Initialize provision embeddings for two-pass analysis
    const provisions = getProvisionCatalog();
    console.log(`Pre-computing embeddings for ${provisions.length} provisions...`);
    await initializeProvisionEmbeddings();
    console.log('Provision embeddings cached');

    // Start server
    app.listen(config.port, () => {
      console.log(`
🚀 CertMaster Crane Backend Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Server running on port ${config.port}
Environment: ${process.env.NODE_ENV || 'development'}
Pinecone Index: ${config.pinecone.indexName}
Model: ${config.google.analysisModel}
Provisions: ${provisions.length} (embeddings cached)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
