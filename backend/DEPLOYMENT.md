# Deployment Guide

This guide covers deploying the CertMaster Crane Backend to Google Cloud Run.

## Prerequisites

1. Google Cloud Project set up
2. Google Cloud CLI (`gcloud`) installed
3. Docker installed locally (for testing)
4. Firebase project configured

## Environment Variables

The following environment variables are required:

```bash
# Server
PORT=8080
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.com

# OpenAI
OPENAI_API_KEY=sk-...

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@your-project-id.iam.gserviceaccount.com
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com

# Firestore Collections
FIRESTORE_CONTRACTS_COLLECTION=contracts
FIRESTORE_JOBS_COLLECTION=analysisJobs
FIRESTORE_FINDINGS_COLLECTION=findings
```

## Google Cloud Setup

### 1. Enable Required APIs

```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

### 2. Create Secrets in Secret Manager

Store sensitive credentials in Google Secret Manager:

```bash
# OpenAI API Key
echo -n "sk-your-openai-key" | gcloud secrets create openai-api-key --data-file=-

# Firebase Private Key (from service account JSON)
echo -n "YOUR_FIREBASE_PRIVATE_KEY" | gcloud secrets create firebase-private-key --data-file=-
```

### 3. Grant Secret Access to Cloud Run

```bash
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding firebase-private-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Deployment Options

### Option 1: Manual Deployment

Build and deploy manually:

```bash
# Build Docker image
docker build -t gcr.io/YOUR_PROJECT_ID/certmaster-crane-backend .

# Push to Container Registry
docker push gcr.io/YOUR_PROJECT_ID/certmaster-crane-backend

# Deploy to Cloud Run
gcloud run deploy certmaster-crane-backend \
  --image gcr.io/YOUR_PROJECT_ID/certmaster-crane-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900s \
  --max-instances 10 \
  --min-instances 0 \
  --concurrency 10 \
  --set-env-vars NODE_ENV=production,FRONTEND_URL=https://your-frontend.com,FIREBASE_PROJECT_ID=your-project-id,FIREBASE_CLIENT_EMAIL=your-email,FIREBASE_STORAGE_BUCKET=your-bucket \
  --set-secrets OPENAI_API_KEY=openai-api-key:latest,FIREBASE_PRIVATE_KEY=firebase-private-key:latest
```

### Option 2: Automated with Cloud Build

Use Cloud Build for CI/CD:

```bash
# Submit build
gcloud builds submit --config cloudbuild.yaml .
```

Or set up a trigger for automatic deployments on git push:

```bash
gcloud builds triggers create github \
  --repo-name=certmaster-crane-backend \
  --repo-owner=YOUR_GITHUB_USERNAME \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml
```

## Testing Deployment

### 1. Test Health Endpoint

```bash
curl https://YOUR_CLOUD_RUN_URL/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-24T..."
}
```

### 2. Test Authentication

```bash
curl https://YOUR_CLOUD_RUN_URL/api/analyze \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contractId": "test-id"}'
```

## Monitoring

### View Logs

```bash
gcloud run services logs read certmaster-crane-backend \
  --limit 50 \
  --region us-central1
```

### Monitor Performance

View metrics in Cloud Console:
- https://console.cloud.google.com/run

Key metrics to watch:
- Request count
- Request latency (p50, p95, p99)
- Memory utilization
- CPU utilization
- Error rate

## Scaling Configuration

Adjust scaling based on your needs:

```bash
gcloud run services update certmaster-crane-backend \
  --min-instances 1 \      # Keep warm (costs more but faster)
  --max-instances 20 \     # Handle traffic spikes
  --concurrency 10 \       # Requests per instance
  --region us-central1
```

## Cost Optimization

For development/low traffic:
- Set `--min-instances=0` (scale to zero)
- Use smaller memory: `--memory=1Gi`
- Reduce CPU: `--cpu=1`

For production:
- Set `--min-instances=1` (avoid cold starts)
- Use recommended: `--memory=2Gi --cpu=2`
- Monitor and adjust based on actual usage

## Troubleshooting

### Container fails to start

Check logs:
```bash
gcloud run services logs read certmaster-crane-backend --region us-central1
```

Common issues:
- Missing environment variables
- Secret permissions not granted
- Port binding (must use PORT env var)

### Timeout errors

Increase timeout:
```bash
gcloud run services update certmaster-crane-backend \
  --timeout 900s \
  --region us-central1
```

### Out of memory

Increase memory allocation:
```bash
gcloud run services update certmaster-crane-backend \
  --memory 4Gi \
  --region us-central1
```

## Rollback

If deployment fails, rollback to previous version:

```bash
# List revisions
gcloud run revisions list --service certmaster-crane-backend

# Rollback to specific revision
gcloud run services update-traffic certmaster-crane-backend \
  --to-revisions REVISION_NAME=100
```

## Next Steps

1. Set up monitoring alerts
2. Configure custom domain
3. Implement rate limiting
4. Set up backup/disaster recovery
5. Configure CI/CD pipeline
